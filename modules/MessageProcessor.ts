import ConfigManager from './ConfigManager.js';
import { CustomerIdentifier } from './CustomerIdentifier.js';
import { getContentType } from '@whiskeysockets/baileys';
import type { Logger } from 'pino';
import type { MenuActionId } from './BusinessCatalog.js';

export type ExtractedMessage = {
    type: string | undefined;
    text: string;
    buttonId: string | null;
    isGroup: boolean;
    remoteJid: string;
    senderNum: string;
    senderCrmFormat: string;
    senderName: string;
    isReplyToBot: boolean;
    hasAudio: boolean;
    messageId: string | undefined;
    fromMe: boolean;
    mentionedJid: string[];
};

export class MessageProcessor {
    private config: ConfigManager;
    private logger: Logger;
    private customerId: CustomerIdentifier;
    private botId: string = '';

    constructor(logger: Logger) {
        this.config = ConfigManager.getInstance();
        this.logger = logger;
        this.customerId = new CustomerIdentifier();
    }

    public setBotId(id: string) {
        this.botId = this.customerId.getClientId(id);
    }

    public extractInfo(m: any): ExtractedMessage | null {
        const message = m.message;
        if (!message) return null;

        const type = getContentType(message);
        let text = '';
        let buttonId: string | null = null;
        let hasAudio = false;

        if (type === 'conversation') text = message.conversation;
        else if (type === 'extendedTextMessage') text = message.extendedTextMessage.text;
        else if (type === 'imageMessage' && message.imageMessage.caption) text = message.imageMessage.caption;
        else if (type === 'videoMessage' && message.videoMessage.caption) text = message.videoMessage.caption;
        else if (type === 'audioMessage') hasAudio = true;
        else if (type === 'buttonsResponseMessage') {
            buttonId = message.buttonsResponseMessage?.selectedButtonId || null;
            text = message.buttonsResponseMessage?.selectedDisplayText || buttonId || '';
        } else if (type === 'templateButtonReplyMessage') {
            buttonId = message.templateButtonReplyMessage?.selectedId || null;
            text = message.templateButtonReplyMessage?.selectedDisplayText || buttonId || '';
        } else if (type === 'listResponseMessage') {
            buttonId = message.listResponseMessage?.singleSelectReply?.selectedRowId || null;
            text = message.listResponseMessage?.title || buttonId || '';
        } else if (type === 'interactiveResponseMessage') {
            const native = message.interactiveResponseMessage?.nativeFlowResponseMessage;
            if (native?.paramsJson) {
                try {
                    const parsed = JSON.parse(native.paramsJson);
                    buttonId = parsed.id || parsed.selectedId || parsed.row_id || null;
                    text = parsed.display_text || parsed.title || buttonId || '';
                } catch {
                    text = native.name || '';
                }
            } else {
                text = message.interactiveResponseMessage?.body?.text || '';
            }
        }

        const remoteJid = m.key.remoteJid || '';
        const isGroup = remoteJid.endsWith('@g.us');

        let senderRaw = isGroup ? m.key.participant : remoteJid;
        if (m.key.fromMe) senderRaw = this.botId;

        const senderPn = m.key.senderPn || m.key.remoteJidAlt || senderRaw;
        const senderNum = this.customerId.getClientId(senderPn);
        const senderCrmFormat = this.customerId.formatForCRM(senderPn);

        const contextInfo =
            message?.extendedTextMessage?.contextInfo ||
            message?.templateButtonReplyMessage?.contextInfo ||
            message?.buttonsResponseMessage?.contextInfo ||
            message?.listResponseMessage?.contextInfo ||
            message?.interactiveResponseMessage?.contextInfo;
        const repliedJid = contextInfo?.participant || '';
        const isReplyToBot = !!repliedJid && this.customerId.getClientId(repliedJid) === this.botId;

        return {
            type,
            text: text || '',
            buttonId,
            isGroup,
            remoteJid,
            senderNum,
            senderCrmFormat,
            senderName: m.pushName || 'Cliente',
            isReplyToBot,
            hasAudio,
            messageId: m.key.id,
            fromMe: m.key.fromMe || false,
            mentionedJid: contextInfo?.mentionedJid || [],
        };
    }

    public asMenuAction(buttonId: string | null): MenuActionId | null {
        if (!buttonId) return null;
        const allowed: MenuActionId[] = [
            'menu_principal',
            'ver_menu',
            'ver_precos',
            'marcar',
            'encomendar',
            'falar_humano',
            'redes',
        ];
        return allowed.includes(buttonId as MenuActionId) ? (buttonId as MenuActionId) : null;
    }

    public shouldRespondToAI(info: ExtractedMessage, rawMessage: any): boolean {
        if (info.fromMe) return false;

        if (rawMessage.messageStubType) {
            this.logger.debug('STUB ignorado');
            return false;
        }

        if (info.buttonId) return true;

        const textoLimpo = (info.text || '').trim();
        if (!info.hasAudio && textoLimpo.length === 0) return false;

        if (!info.isGroup) {
            const emojiOnlyRegex = /^[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\s]{1,10}$/u;
            if (emojiOnlyRegex.test(textoLimpo) && textoLimpo.length <= 10) return false;
            return true;
        }

        if (info.isReplyToBot) return true;

        const isBotMentioned = info.mentionedJid.some(
            (jid) => this.customerId.getClientId(jid) === this.botId
        );
        if (isBotMentioned) return true;

        const botName = (this.config.COMPANY_NAME || '').toLowerCase();
        if (botName && textoLimpo.toLowerCase().includes(botName)) return true;

        return false;
    }

    public isBusinessOpen(): boolean {
        const hour = Number(
            new Intl.DateTimeFormat('en-GB', {
                timeZone: this.config.TIMEZONE,
                hour: 'numeric',
                hourCycle: 'h23',
            }).format(new Date())
        );
        return hour >= this.config.BUSINESS_HOURS_START && hour < this.config.BUSINESS_HOURS_END;
    }
}
