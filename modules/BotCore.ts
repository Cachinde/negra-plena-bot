import http from 'http';
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
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
    private latestQR: string | null = null;
    private latestQRDataUrl: string | null = null;
    private lastQRAt: number | null = null;
    private pairingCode: string | null = null;

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
        this.httpServer = http.createServer((req, res) => {
            const url = new URL(req.url || '/', 'http://localhost');
            const path = url.pathname.replace(/\/$/, '') || '/';

            if (path === '/qr' || path === '/qrcode' || path === '/scan') {
                const html = this.getQrPageHtml();
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(html);
                return;
            }

            if (path === '/qr.json') {
                const body = JSON.stringify({
                    status: 'ok',
                    whatsapp: this.isConnected ? 'online' : 'connecting',
                    empresa: this.config.COMPANY_NAME,
                    qr_available: !!this.latestQRDataUrl,
                    pairing_code: this.pairingCode,
                    updated_at: this.lastQRAt ? new Date(this.lastQRAt).toISOString() : null,
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(body);
                return;
            }

            if (path === '/qr.png') {
                if (!this.latestQRDataUrl) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'waiting', message: 'QR ainda não gerado' }));
                    return;
                }
                const base64 = this.latestQRDataUrl.split(',')[1] || '';
                const buf = Buffer.from(base64, 'base64');
                res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buf.length });
                res.end(buf);
                return;
            }

            const body = JSON.stringify({
                status: 'ok',
                whatsapp: this.isConnected ? 'online' : 'connecting',
                empresa: this.config.COMPANY_NAME,
                qr_available: !!this.latestQRDataUrl,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(body);
        });

        this.httpServer.listen(this.config.PORT, '0.0.0.0', () => {
            this.logger.info(`Healthcheck a escutar em 0.0.0.0:${this.config.PORT} (/, /qr, /qr.json, /qr.png)`);
        });
    }

    private escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private getQrPageHtml(): string {
        const empresa = this.escapeHtml(this.config.COMPANY_NAME);
        const online = this.isConnected;
        const statusText = online ? 'WhatsApp ligado' : 'A ligar WhatsApp…';
        const statusColor = online ? '#16a34a' : '#d97706';
        const updated = this.lastQRAt ? new Date(this.lastQRAt).toLocaleString('pt-AO') : '—';
        const pairing = this.pairingCode ? this.escapeHtml(this.pairingCode) : null;

        let main: string;
        if (online && !this.latestQRDataUrl) {
            main = `<div class="ok">✅ Sessão ligada. Não é preciso ler QR.</div>`;
        } else if (this.latestQRDataUrl) {
            main = `
                <img src="${this.latestQRDataUrl}" alt="QR WhatsApp" width="280" height="280" />
                <p class="muted">Actualizado em ${this.escapeHtml(updated)} · a página recarrega sozinha de 8 em 8s</p>
                ${pairing ? `<p>Código de emparelhamento: <strong class="code">${pairing}</strong></p>` : ''}
                <p><a href="/qr.png" target="_blank">Abrir só a imagem (/qr.png)</a></p>`;
        } else if (pairing) {
            main = `<p>Código de emparelhamento: <strong class="code">${pairing}</strong></p>
                <p class="muted">No WhatsApp: Aparelhos ligados &gt; Ligar um aparelho &gt; Ligar com número.</p>`;
        } else {
            main = `<div class="waiting"><span class="spin"></span> A gerar QR… aguarde e recarregue.</div>`;
        }

        return `<!doctype html><html lang="pt"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="8" />
<title>${empresa} — Ligar WhatsApp</title>
<style>
body{font-family:system-ui,Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;max-width:420px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}
h1{font-size:20px;margin:0 0 4px}.sub{color:#94a3b8;font-size:13px;margin:0 0 16px}
.badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:13px;font-weight:700;color:#fff;background:${statusColor};margin-bottom:16px}
img{background:#fff;border-radius:12px;padding:8px}
.code{font-size:28px;letter-spacing:4px;background:#0f172a;border:1px dashed #475569;border-radius:8px;padding:6px 14px}
.muted{color:#94a3b8;font-size:12px}a{color:#38bdf8;font-size:13px}
.ok{background:#052e16;border:1px solid #16a34a;border-radius:10px;padding:14px;font-weight:700}
.waiting{padding:20px;color:#fbbf24}.spin{display:inline-block;width:18px;height:18px;border:3px solid #fbbf24;border-top-color:transparent;border-radius:50%;animation:s 1s linear infinite;vertical-align:-4px;margin-right:8px}@keyframes s{to{transform:rotate(360deg)}}
ol{text-align:left;font-size:13px;color:#cbd5e1;line-height:1.7}
</style></head><body><div class="card">
<h1>${empresa} — WhatsApp</h1><p class="sub">Ligue o número da empresa</p>
<div class="badge">${statusText}</div>
${main}
<ol><li>No telemóvel abra o <strong>WhatsApp</strong></li><li><strong>Regulações / Aparelhos ligados</strong></li><li><strong>Ligar um aparelho</strong> e aponte ao QR</li></ol>
<p class="muted">Endpoints: <a href="/">/</a> · <a href="/qr.json">/qr.json</a> · <a href="/qr.png">/qr.png</a></p>
</div></body></html>`;
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
                this.pairingRequested = false;
                const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                this.logger.warn({ statusCode }, 'Ligação WhatsApp fechada');

                if (shouldReconnect) {
                    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
                } else {
                    this.logger.error('Sessão terminada. É necessário voltar a emparelhar o número.');
                    this.latestQR = null;
                    this.latestQRDataUrl = null;
                    this.pairingCode = null;
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                this.pairingRequested = false;
                this.latestQR = null;
                this.latestQRDataUrl = null;
                this.pairingCode = null;
                this.lastQRAt = null;
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
        this.latestQR = qr;
        this.lastQRAt = Date.now();
        try {
            this.latestQRDataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 2, errorCorrectionLevel: 'H' });
        } catch (err) {
            this.logger.error({ err }, 'Falha ao gerar imagem do QR');
            this.latestQRDataUrl = null;
        }

        if (this.config.BOT_NUMERO_REAL && this.sock && !this.sock.authState.creds.registered) {
            if (this.pairingRequested) return;
            this.pairingRequested = true;
            try {
                const code = await this.sock.requestPairingCode(this.config.BOT_NUMERO_REAL);
                this.pairingCode = code;
                this.lastQRAt = Date.now();
                this.logger.info(`Código de emparelhamento WhatsApp: ${code} — ver também em /qr`);
            } catch (err) {
                this.logger.error({ err }, 'Falha ao pedir pairing code');
            }
            return;
        }

        this.logger.info('Leia o QR no WhatsApp: Aparelhos ligados > Ligar um aparelho — ou abra /qr no browser');
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
