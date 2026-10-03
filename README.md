# Negra Plena Bot (WhatsApp · Railway)

Conector WhatsApp da **Negra Plena** em TypeScript (Baileys).
O cérebro (Plenitude) corre à parte no Hugging Face Space: **brain-negra-plena**.

O bot inicia sessão com o número da empresa (QR nos logs ou código de emparelhamento via `BOT_NUMERO_REAL`) e envia cada mensagem de cliente para `POST {API_URL}/escutar`.

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
5. Nos logs, ler o QR (ou código de emparelhamento) e ligar o WhatsApp da empresa.

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
