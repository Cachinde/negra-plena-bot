import { BotCore } from './modules/BotCore.js';

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

console.log('A iniciar Negra Plena Bot...');

const bot = new BotCore();
bot.connect().catch((err) => {
    console.error('Falha ao iniciar o bot:', err);
    process.exit(1);
});
