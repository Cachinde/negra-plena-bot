import {
    generateWAMessageFromContent,
    proto,
    type WASocket,
} from '@whiskeysockets/baileys';
import type { Logger } from 'pino';
import {
    FOLLOWUP_BUTTONS,
    MAIN_MENU_BUTTONS,
    MENU_CATALOG_TEXT,
    PRICES_TEXT,
    SOCIAL,
    WELCOME_TEXT,
    type MenuActionId,
} from './BusinessCatalog.js';
import { TicketManager } from './TicketManager.js';
import fs from 'fs';
import path from 'path';

type ClientCtx = {
    numero: string;
    numero_crm: string;
    nome: string;
};

const NATIVE_FLOW_NODES = [
    {
        tag: 'biz',
        attrs: {},
        content: [
            {
                tag: 'interactive',
                attrs: { type: 'native_flow', v: '1' },
                content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
            },
        ],
    },
];

export class InteractiveMenu {
    private logger: Logger;
    private tickets: TicketManager;
    private greeted = new Set<string>();

    constructor(logger: Logger, tickets: TicketManager) {
        this.logger = logger;
        this.tickets = tickets;
    }

    public isMenuTrigger(text: string): boolean {
        // Só comandos exactos disparam o menu. Qualquer pergunta com mais
        // palavras (ex. "qual é o preço da pizza?") vai para o cérebro.
        const t = text.trim().toLowerCase();
        if (!t) return false;
        return /^(oi|ol[aá]|ola|bom dia|boa tarde|boa noite|menu|in[ií]cio|start|ajuda|help|pre[cç]o|pre[cç]os|pre[cç][aá]rio|marcar|marca[cç][aã]o|encomendar|encomenda)$/i.test(t);
    }

    public resolveActionFromText(text: string): MenuActionId | null {
        const t = text.trim().toLowerCase();
        if (/^(1|menu|ver menu|cat[aá]logo)$/i.test(t) || t === 'ver_menu') return 'ver_menu';
        if (/^(2|pre[cç]o|pre[cç]os|pre[cç][aá]rio)$/i.test(t) || t === 'ver_precos') return 'ver_precos';
        if (/^(3|marcar|marca[cç][aã]o)$/i.test(t) || t === 'marcar') return 'marcar';
        if (/^(4|encomendar|encomenda)$/i.test(t) || t === 'encomendar') return 'encomendar';
        if (/^(5|humano|atendente|pessoa)$/i.test(t) || t === 'falar_humano') return 'falar_humano';
        if (/redes|instagram|facebook/.test(t)) return 'redes';
        if (/^(0|in[ií]cio|voltar)$/i.test(t) || t === 'menu_principal') return 'menu_principal';
        return null;
    }

    public shouldShowWelcome(clientKey: string, text: string): boolean {
        if (this.greeted.has(clientKey)) return false;
        const t = text.trim().toLowerCase();
        return !t || /^(oi|ol[aá]|ola|bom dia|boa tarde|boa noite|menu|in[ií]cio)$/i.test(t);
    }

    public markGreeted(clientKey: string) {
        this.greeted.add(clientKey);
    }

    public async handleAction(
        sock: WASocket,
        jid: string,
        action: MenuActionId,
        ctx: ClientCtx,
        quoted?: any
    ): Promise<boolean> {
        switch (action) {
            case 'menu_principal':
                await this.sendMainMenu(sock, jid, WELCOME_TEXT, quoted);
                return true;
            case 'ver_menu':
                await this.sendTextWithButtons(sock, jid, MENU_CATALOG_TEXT, FOLLOWUP_BUTTONS, quoted);
                return true;
            case 'ver_precos':
                await this.sendTextWithButtons(sock, jid, PRICES_TEXT, FOLLOWUP_BUTTONS, quoted);
                return true;
            case 'redes':
                await this.sendTextWithButtons(
                    sock,
                    jid,
                    `*Redes Negra Plena*\nInstagram: ${SOCIAL.instagram}\nFacebook: ${SOCIAL.facebook}`,
                    FOLLOWUP_BUTTONS,
                    quoted
                );
                return true;
            case 'marcar':
            case 'encomendar':
            case 'falar_humano': {
                const tipo = action === 'marcar' ? 'marcacao' : action === 'encomendar' ? 'encomenda' : 'humano';
                const ticket = this.tickets.createTicket({
                    tipo,
                    numero: ctx.numero,
                    numero_crm: ctx.numero_crm,
                    nome: ctx.nome,
                    detalhe:
                        action === 'marcar'
                            ? 'Cliente pediu marcação'
                            : action === 'encomendar'
                              ? 'Cliente solicitou encomenda'
                              : 'Cliente pediu atendimento humano',
                });
                await this.sendTextWithButtons(
                    sock,
                    jid,
                    this.tickets.formatTicketMessage(ticket),
                    [
                        { id: 'ver_menu', text: '📋 Ver menu' },
                        { id: 'ver_precos', text: '💰 Preçário' },
                        { id: 'menu_principal', text: '🏠 Menu principal' },
                    ],
                    quoted
                );
                return true;
            }
            default:
                return false;
        }
    }

    public async sendMainMenu(sock: WASocket, jid: string, body = WELCOME_TEXT, quoted?: any) {
        const fallback =
            `${body}\n\n` +
            '*Menu*\n' +
            '1️⃣ Ver menu\n' +
            '2️⃣ Preçário\n' +
            '3️⃣ Marcação\n' +
            '4️⃣ Solicitar encomenda\n' +
            '5️⃣ Atendimento humano\n\n' +
            '_Toque num botão ou responda com o número._';

        await this.sendTextWithButtons(sock, jid, fallback, MAIN_MENU_BUTTONS.concat([
            { id: 'falar_humano', text: '👤 Atendimento humano' },
        ]), quoted);
    }

    public async sendTextWithButtons(
        sock: WASocket,
        jid: string,
        text: string,
        buttons: Array<{ id: string; text: string }>,
        quoted?: any
    ) {
        try {
            await this.sendNativeButtons(sock, jid, text, buttons, quoted);
        } catch (err) {
            this.logger.warn({ err }, 'Botões nativos falharam — a enviar texto');
            const lines = buttons.map((b, i) => `${i + 1}️⃣ ${b.text}`).join('\n');
            await sock.sendMessage(jid, { text: `${text}\n\n${lines}` }, quoted ? { quoted } : undefined);
        }
    }

    private getBannerPath(action: MenuActionId): string | null {
        const base = process.cwd();
        const mapa: Partial<Record<MenuActionId, string>> = {
            menu_principal: 'main.png',
            ver_menu: 'main.png',
            ver_precos: 'delicias.png',
            encomendar: 'delicias.png',
            marcar: 'delicias.png',
        };
        const ficheiro = mapa[action];
        return ficheiro ? path.join(base, 'assets', ficheiro) : null;
    }

    private async sendBannerIfExists(sock: WASocket, jid: string, action: MenuActionId): Promise<void> {
        const bannerPath = this.getBannerPath(action);
        if (bannerPath && fs.existsSync(bannerPath)) {
            const data = fs.readFileSync(bannerPath);
            if (data.length === 0) return;
            await sock.sendMessage(jid, { image: data });
        }
    }
    private async sendNativeButtons(
        sock: WASocket,
        jid: string,
        text: string,
        buttons: Array<{ id: string; text: string }>,
        quoted?: any
    ) {
        const nativeButtons =
            buttons.length > 3
                ? [
                      {
                          name: 'single_select',
                          buttonParamsJson: JSON.stringify({
                              title: 'Abrir menu',
                              sections: [
                                  {
                                      title: 'Negra Plena',
                                      rows: buttons.map((b) => ({
                                          header: b.text,
                                          title: b.text,
                                          description: 'Toque para escolher',
                                          id: b.id,
                                      })),
                                  },
                              ],
                          }),
                      },
                  ]
                : buttons.slice(0, 3).map((b) => ({
                      name: 'quick_reply',
                      buttonParamsJson: JSON.stringify({
                          display_text: b.text,
                          id: b.id,
                      }),
                  }));

        const content = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2,
                    },
                    interactiveMessage: {
                        body: { text },
                        footer: { text: 'Negra Plena · SoftEdge' },
                        nativeFlowMessage: {
                            buttons: nativeButtons,
                            messageParamsJson: JSON.stringify({ from: 'negra_plena' }),
                        },
                    },
                },
            },
        } as proto.IMessage;

        const msg = generateWAMessageFromContent(jid, content, {
            userJid: sock.user?.id || jid,
            quoted,
        });

        await sock.relayMessage(jid, msg.message!, {
            messageId: msg.key.id!,
            additionalNodes: NATIVE_FLOW_NODES as any,
        });
    }
}
