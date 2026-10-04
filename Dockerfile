FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

COPY index.ts ./
COPY modules ./modules
COPY assets ./assets

RUN npx tsc && npm prune --omit=dev

RUN mkdir -p temp auth_info_baileys

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
