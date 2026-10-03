import http from 'http';
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino, { type Logger } from 'pino';
import fs from 'fs';
import ConfigManager from './ConfigManager.js';
import { MessageProcessor } from './MessageProcessor.js';
import { APIClient } from './APIClient.js';
import { AudioProcessor } from './AudioProcessor.js';
import { CustomerIdentifier } from './CustomerIdentifier.js';
import { InteractiveMenu } from './InteractiveMenu.js';
import { TicketManager } from './TicketManager.js';

export class BotCore {
    public config: ConfigManager;
    public logger: Logger;
    public sock: WASocket | null = null;
    public isConnected = false;

    private messageProcessor: MessageProcessor;
    private apiClient: APIClient;
    private audioProcessor: AudioProcessor;
    private customerId: CustomerIdentifier;
    private tickets: TicketManager;
    private menu: InteractiveMenu;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private pairingRequested = false;
    private httpServer: http.Server | null = null;

    constructor() {
        this.config = ConfigManager.getInstance();
        this.logger = pino({ level: this.config.LOG_LEVEL });

        if (!fs.existsSync(this.config.AUTH_FOLDER)) {
            fs.mkdirSync(this.config.AUTH_FOLDER, { recursive: true });
        }
        if (!fs.existsSync(this.config.TEMP_FOLDER)) {
            fs.mkdirSync(this.config.TEMP_FOLDER, { recursive: true });
        }

        this.customerId = new CustomerIdentifier();
        this.messageProcessor = new MessageProcessor(this.logger);
        this.apiClient = new APIClient(this.logger);
        this.audioProcessor = new AudioProcessor(this.logger);
        this.tickets = new TicketManager();
        this.menu = new InteractiveMenu(this.logger, this.tickets);
        this.startHealthServer();
    }

    private startHealthServer() {
        this.httpServer = http.createServer((_req, res) => {
            const body = JSON.stringify({
                status: 'ok',
                whatsapp: this.isConnected ? 'online' : 'connecting',
                empresa: this.config.COMPANY_NAME,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(body);
        });

        this.httpServer.listen(this.config.PORT, '0.0.0.0', () => {
            this.logger.info(`Healthcheck a escutar em 0.0.0.0:${this.config.PORT}`);
        });
    }

    public async connect() {
        const { state, saveCreds } = await useMultiFileAuthState(this.config.AUTH_FOLDER);

        this.sock = makeWASocket({
            auth: state,
            browser: Browsers.macOS('Desktop'),
            logger: this.logger.child({ level: 'silent' }),
            syncFullHistory: false,
            markOnlineOnConnect: true,
        });

        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                await this.handleAuth(qr);
            }

            if (connection === 'close') {
                this.isConnected = false;
                const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                this.logger.warn({ statusCode }, 'Ligação WhatsApp fechada');

                if (shouldReconnect) {
                    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
                } else {
                    this.logger.error('Sessão terminada. É necessário voltar a emparelhar o número.');
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                this.pairingRequested = false;
                const botJid = this.sock?.user?.id;
                if (botJid) {
                    this.messageProcessor.setBotId(botJid);
                    this.logger.info(`${this.config.COMPANY_NAME} Bot online`);
                }
            }
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('messages.upsert', async (m) => {
            if (m.type !== 'notify') return;
            for (const msg of m.messages) {
                if (!msg.message) continue;
                await this.handleIncomingMessage(msg);
            }
        });
    }

    private async handleAuth(qr: string) {
        if (this.config.BOT_NUMERO_REAL && this.sock && !this.sock.authState.creds.registered) {
            if (this.pairingRequested) return;
            this.pairingRequested = true;
            const code = await this.sock.requestPairingCode(this.config.BOT_NUMERO_REAL);
            this.logger.info(`Código de emparelhamento WhatsApp: ${code}`);
            return;
        }

        this.logger.info('Leia o QR no WhatsApp: Aparelhos ligados > Ligar um aparelho');
        qrcode.generate(qr, { small: true });
    }

    private async handleIncomingMessage(msg: any) {
        if (!this.sock) return;

        try {
            const info = this.messageProcessor.extractInfo(msg);
            if (!info || !this.messageProcessor.shouldRespondToAI(info, msg)) return;

            this.logger.info(`[${info.isGroup ? 'GRUPO' : 'PV'}] ${info.senderCrmFormat}`);

            if (!info.isGroup && !this.messageProcessor.isBusinessOpen()) {
                await this.sock.sendMessage(info.remoteJid, { text: this.config.AWAY_MESSAGE });
                return;
            }

            const clientKey = info.senderCrmFormat || info.senderNum;
            const ctx = {
                numero: info.senderNum,
                numero_crm: info.senderCrmFormat,
                nome: info.senderName,
            };

            // 1) Botão / lista nativa
            const fromButton = this.messageProcessor.asMenuAction(info.buttonId);
            if (fromButton) {
                this.menu.markGreeted(clientKey);
                await this.menu.handleAction(this.sock, info.remoteJid, fromButton, ctx, msg);
                return;
            }

            // 2) Texto curto de menu (1/2/3… ou "preços", "encomendar"…)
            const fromText = this.menu.resolveActionFromText(info.text);
            if (fromText) {
                this.menu.markGreeted(clientKey);
                await this.menu.handleAction(this.sock, info.remoteJid, fromText, ctx, msg);
                return;
            }

            // 3) Primeira saudação → menu com botões
            if (!info.isGroup && this.menu.shouldShowWelcome(clientKey, info.text)) {
                this.menu.markGreeted(clientKey);
                await this.menu.sendMainMenu(this.sock, info.remoteJid, undefined, msg);
                return;
            }

            // 4) Pedido explícito de menu
            if (!info.isGroup && this.menu.isMenuTrigger(info.text)) {
                this.menu.markGreeted(clientKey);
                await this.menu.sendMainMenu(this.sock, info.remoteJid, undefined, msg);
                return;
            }

            let audioBase64: string | null = null;
            if (info.hasAudio) {
                const buffer = await this.audioProcessor.downloadAudio(msg);
                if (buffer) audioBase64 = buffer.toString('base64');
            }

            const payload = {
                numero: info.senderNum,
                numero_crm: info.senderCrmFormat,
                nome: info.senderName,
                texto: info.text,
                tipo_conversa: info.isGroup ? 'grupo' : 'pv',
                grupo_id: info.isGroup ? this.customerId.getClientId(info.remoteJid) : null,
                mensagem_id: info.messageId,
                audio_base64: audioBase64,
                ticket_aberto: this.tickets.getOpenTicket(clientKey)?.id || null,
            };

            await this.sock.presenceSubscribe(info.remoteJid);
            await this.sock.sendPresenceUpdate('composing', info.remoteJid);

            try {
                const resposta = await this.apiClient.queueApiCall(payload);
                await this.sock.sendPresenceUpdate('paused', info.remoteJid);

                if (resposta?.texto) {
                    await this.sock.sendMessage(info.remoteJid, { text: resposta.texto }, { quoted: msg });
                }
            } catch (err) {
                await this.sock.sendPresenceUpdate('paused', info.remoteJid);
                this.logger.error({ err }, 'Falha ao contactar o cérebro');
                await this.sock.sendMessage(info.remoteJid, { text: this.config.FALLBACK_MESSAGE });
            }
        } catch (err) {
            this.logger.error({ err }, 'Erro em handleIncomingMessage');
        }
    }
}
