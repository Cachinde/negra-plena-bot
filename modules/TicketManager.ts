import fs from 'fs';
import path from 'path';
import ConfigManager from './ConfigManager.js';

export type TicketTipo = 'marcacao' | 'encomenda' | 'humano';
export type TicketStatus = 'aberto' | 'em_atendimento' | 'fechado';

export type Ticket = {
    id: string;
    tipo: TicketTipo;
    status: TicketStatus;
    numero: string;
    numero_crm: string;
    nome: string;
    detalhe: string;
    criado_em: string;
    actualizado_em: string;
};

export class TicketManager {
    private config: ConfigManager;
    private tickets = new Map<string, Ticket>();
    private openByClient = new Map<string, string>();
    private filePath: string;
    private seq = 0;

    constructor() {
        this.config = ConfigManager.getInstance();
        this.filePath = path.join(this.config.TEMP_FOLDER, 'tickets.json');
        this.load();
    }

    private load() {
        try {
            if (!fs.existsSync(this.filePath)) return;
            const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Ticket[];
            for (const t of raw) {
                this.tickets.set(t.id, t);
                if (t.status === 'aberto' || t.status === 'em_atendimento') {
                    this.openByClient.set(t.numero_crm || t.numero, t.id);
                }
                const n = Number(String(t.id).replace(/\D/g, ''));
                if (n > this.seq) this.seq = n;
            }
        } catch {
            // ficheiro corrompido — começa limpo
        }
    }

    private save() {
        try {
            if (!fs.existsSync(this.config.TEMP_FOLDER)) {
                fs.mkdirSync(this.config.TEMP_FOLDER, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify([...this.tickets.values()], null, 2), 'utf8');
        } catch {
            // não bloquear o bot por falha de disco
        }
    }

    private nextId(): string {
        this.seq += 1;
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return `NP-${day}-${String(this.seq).padStart(4, '0')}`;
    }

    public getOpenTicket(clientKey: string): Ticket | null {
        const id = this.openByClient.get(clientKey);
        if (!id) return null;
        return this.tickets.get(id) || null;
    }

    public createTicket(input: {
        tipo: TicketTipo;
        numero: string;
        numero_crm: string;
        nome: string;
        detalhe?: string;
    }): Ticket {
        const clientKey = input.numero_crm || input.numero;
        const existing = this.getOpenTicket(clientKey);
        if (existing) {
            existing.tipo = input.tipo;
            existing.detalhe = input.detalhe || existing.detalhe;
            existing.actualizado_em = new Date().toISOString();
            this.save();
            return existing;
        }

        const now = new Date().toISOString();
        const ticket: Ticket = {
            id: this.nextId(),
            tipo: input.tipo,
            status: 'aberto',
            numero: input.numero,
            numero_crm: input.numero_crm,
            nome: input.nome,
            detalhe: input.detalhe || '',
            criado_em: now,
            actualizado_em: now,
        };
        this.tickets.set(ticket.id, ticket);
        this.openByClient.set(clientKey, ticket.id);
        this.save();
        return ticket;
    }

    public closeTicket(clientKey: string): Ticket | null {
        const ticket = this.getOpenTicket(clientKey);
        if (!ticket) return null;
        ticket.status = 'fechado';
        ticket.actualizado_em = new Date().toISOString();
        this.openByClient.delete(clientKey);
        this.save();
        return ticket;
    }

    public formatTicketMessage(ticket: Ticket): string {
        const tipoLabel =
            ticket.tipo === 'marcacao'
                ? 'Marcação'
                : ticket.tipo === 'encomenda'
                  ? 'Encomenda'
                  : 'Atendimento humano';

        return (
            `✅ *Ticket ${ticket.id}*\n` +
            `Tipo: ${tipoLabel}\n` +
            `Cliente: ${ticket.nome}\n` +
            `Estado: *à espera de atendimento humano*\n\n` +
            (ticket.detalhe ? `Nota: ${ticket.detalhe}\n\n` : '') +
            'A equipa da Negra Plena vai contactá-lo(a) em breve.\n' +
            'Enquanto isso, pode continuar a ver o menu ou o preçário.'
        );
    }
}
