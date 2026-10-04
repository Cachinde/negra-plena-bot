import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Procura o .env em todos os layouts: dev (modules/ -> raiz),
// prod (dist/modules -> raiz) e pasta atual. Variáveis reais de
// ambiente (ex. Railway Variables) têm sempre prioridade.
const envCandidates = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
    path.resolve(process.cwd(), '.env'),
];
for (const candidate of envCandidates) {
    if (fs.existsSync(candidate)) {
        dotenv.config({ path: candidate, override: false });
        break;
    }
}

class ConfigManager {
    static instance: ConfigManager | null = null;

    public PORT: number;
    public LOG_LEVEL: string;
    public TEMP_FOLDER: string;
    public AUTH_FOLDER: string;
    public API_URL: string;
    public API_TIMEOUT: number;
    public API_AUTH_TOKEN: string;
    public COMPANY_NAME: string;
    public BUSINESS_HOURS_START: number;
    public BUSINESS_HOURS_END: number;
    public TIMEZONE: string;
    public AWAY_MESSAGE: string;
    public FALLBACK_MESSAGE: string;
    public BOT_NUMERO_REAL: string;

    constructor() {
        this.PORT = Number(process.env.PORT || 3000);
        this.LOG_LEVEL = process.env.LOG_LEVEL || 'info';
        this.TEMP_FOLDER = process.env.TEMP_FOLDER || './temp';
        this.AUTH_FOLDER = process.env.AUTH_FOLDER || './auth_info_baileys';

        this.API_URL = (process.env.API_URL || 'http://localhost:7860/api').replace(/\/$/, '');
        this.API_TIMEOUT = Number(process.env.API_TIMEOUT || 60000);
        this.API_AUTH_TOKEN = process.env.API_AUTH_TOKEN || '';

        this.COMPANY_NAME = process.env.COMPANY_NAME || 'Negra Plena';
        this.BOT_NUMERO_REAL = (process.env.BOT_NUMERO_REAL || '').replace(/\D/g, '');

        this.BUSINESS_HOURS_START = Number(process.env.BUSINESS_HOURS_START || 9);
        this.BUSINESS_HOURS_END = Number(process.env.BUSINESS_HOURS_END || 18);
        this.TIMEZONE = process.env.TIMEZONE || 'Africa/Luanda';

        this.AWAY_MESSAGE =
            process.env.AWAY_MESSAGE ||
            `Olá! Obrigado por contactar a ${this.COMPANY_NAME}. O nosso horário de atendimento é das ${this.BUSINESS_HOURS_START}h às ${this.BUSINESS_HOURS_END}h. Iremos responder-lhe assim que regressarmos.`;

        this.FALLBACK_MESSAGE =
            process.env.FALLBACK_MESSAGE ||
            `Peço desculpa, o atendimento automático está temporariamente indisponível. A ${this.COMPANY_NAME} irá responder-lhe em breve.`;

        ConfigManager.instance = this;
    }

    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }
}

export default ConfigManager;
