import { jidDecode } from '@whiskeysockets/baileys';
import parsePhoneNumberFromString from 'libphonenumber-js';

export class CustomerIdentifier {
    public getClientId(rawJid: string | null | undefined): string {
        if (!rawJid) return 'unknown_customer';

        try {
            const decoded = jidDecode(rawJid);
            if (decoded?.user) return decoded.user;
        } catch {
            // fallback abaixo
        }

        const cleanStr = String(rawJid).split('@')[0].split(':')[0];
        return cleanStr || 'unknown_customer';
    }

    public formatForCRM(rawJid: string): string {
        const numericId = this.getClientId(rawJid);
        if (numericId === 'unknown_customer') return numericId;

        const phoneNumber = parsePhoneNumberFromString(`+${numericId}`);
        if (phoneNumber?.isValid()) return phoneNumber.number;

        return numericId;
    }
}
