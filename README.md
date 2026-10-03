# Negra Plena Bot (WhatsApp · Railway)

Conector WhatsApp da **Negra Plena** em TypeScript (Baileys).  
O cérebro (Plenitude) corre à parte no Hugging Face Space.

## Deploy Railway

1. Ligar este repositório à Railway (Dockerfile).
2. Montar volume persistente em `/app/auth_info_baileys`.
3. Variáveis:
   - `API_URL` — ex. `https://seu-space.hf.space/api`
   - `API_AUTH_TOKEN` — igual ao do Space
   - `BOT_NUMERO_REAL` — só dígitos (indicativo + número), opcional para pairing code
   - `COMPANY_NAME=Negra Plena`
   - `TIMEZONE=Africa/Luanda`
   - `BUSINESS_HOURS_START` / `BUSINESS_HOURS_END`
4. Healthcheck: `/`
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
