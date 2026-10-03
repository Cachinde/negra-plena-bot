import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { Logger } from 'pino';

export class AudioProcessor {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async downloadAudio(message: any): Promise<Buffer | null> {
        try {
            this.logger.info('A descarregar áudio recebido');
            const buffer = await downloadMediaMessage(message, 'buffer', {});
            return buffer as Buffer;
        } catch (error) {
            this.logger.error({ error }, 'Erro ao descarregar áudio');
            return null;
        }
    }
}
