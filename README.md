# Negra Plena Bot (WhatsApp · Railway)

Conector WhatsApp da **Negra Plena** em TypeScript (Baileys).
O cérebro (Plenitude) corre à parte no Hugging Face Space: **brain-negra-plena**.

O bot inicia sessão com o número da empresa (QR nos logs ou código de emparelhamento via `BOT_NUMERO_REAL`) e envia cada mensagem de cliente para `POST {API_URL}/escutar`.
O horário comercial (`BUSINESS_HOURS_*`, `TIMEZONE`) só informa — fora dele o cérebro recebe `fora_expediente: true` (atendimento humano) mas é sempre chamado.

## Deploy Railway

1. Ligar este repositório à Railway (Dockerfile).
2. Montar volume persistente em `/app/auth_info_baileys`.
3. Variáveis:
   - `API_URL` — ex. `https://<user>-brain-negra-plena.hf.space/api`
   - `API_AUTH_TOKEN` — igual ao `API_AUTH_TOKEN` do Space
   - `BOT_NUMERO_REAL` — só dígitos (indicativo + número), opcional para pairing code
   - `COMPANY_NAME=Negra Plena`
   - `TIMEZONE=Africa/Luanda`
   - `BUSINESS_HOURS_START` / `BUSINESS_HOURS_END`
4. Healthcheck: `/` (servidor interno em `PORT`, por defeito `3000`).
5. Ligue o WhatsApp da empresa:
   - Abra `https://<sua-app>.up.railway.app/qr` no browser — mostra o QR em HTML (auto-refresh de 8 em 8s).
   - Ou leia o QR nos logs (`Aparelhos ligados > Ligar um aparelho`).
   - Se usar `BOT_NUMERO_REAL`, o código de emparelhamento também aparece em `/qr` e nos logs.
   - Extras: `/qr.json` (estado + `qr_available`), `/qr.png` (só a imagem).

## Endpoints HTTP (Railway)

- `/` — JSON `{ status, whatsapp, empresa }` (healthcheck)
- `/qr` (alias `/qrcode`, `/scan`) — página HTML com o QR para ligar o WhatsApp
- `/qr.json` — JSON `{ whatsapp, qr_available, pairing_code }`
- `/qr.png` — só a imagem PNG do QR (404 enquanto não há QR)

## Local

```bash
npm install
npm run build
npm start
```

## Estrutura

- `index.ts` — arranque
- `modules/` — Baileys, menus/botões, tickets, API do cérebro
- `Dockerfile` + `railway.toml`
