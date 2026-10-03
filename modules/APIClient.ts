import axios from 'axios';
import type { Logger } from 'pino';
import ConfigManager from './ConfigManager.js';

type QueueJob = {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    payload: Record<string, unknown>;
};

export class APIClient {
    private config: ConfigManager;
    private logger: Logger;
    private queues = new Map<string, QueueJob[]>();
    private processing = new Set<string>();

    constructor(logger: Logger) {
        this.config = ConfigManager.getInstance();
        this.logger = logger;
    }

    private getQueueKey(payload: Record<string, unknown>): string {
        const grupoId = String(payload?.grupo_id || '');
        const numero = String(payload?.numero_crm || payload?.numero || 'unknown');
        if (grupoId) return `grupo:${grupoId}:user:${numero}`;
        return `pv:${numero}`;
    }

    public queueApiCall(payload: Record<string, unknown>): Promise<any> {
        const key = this.getQueueKey(payload);
        return new Promise((resolve, reject) => {
            if (!this.queues.has(key)) this.queues.set(key, []);
            this.queues.get(key)!.push({ resolve, reject, payload });
            this.processQueue(key);
        });
    }

    private async processQueue(key: string): Promise<void> {
        if (this.processing.has(key)) return;
        this.processing.add(key);

        const queue = this.queues.get(key)!;
        while (queue.length > 0) {
            const job = queue.shift()!;
            try {
                job.resolve(await this.send(job.payload));
            } catch (error) {
                job.reject(error);
            }
        }

        this.processing.delete(key);
    }

    private async send(payload: Record<string, unknown>): Promise<any> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.config.API_AUTH_TOKEN) {
            headers.Authorization = `Bearer ${this.config.API_AUTH_TOKEN}`;
        }

        this.logger.info(`A enviar mensagem do cliente ${payload.numero_crm} para o cérebro`);
        const response = await axios.post(`${this.config.API_URL}/escutar`, payload, {
            timeout: this.config.API_TIMEOUT,
            headers,
        });
        return response.data;
    }
}
