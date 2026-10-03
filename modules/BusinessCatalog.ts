export const SOCIAL = {
    instagram: 'https://www.instagram.com/negra_plena',
    facebook: 'https://web.facebook.com/people/Negra-Plena/61579664939743/',
};

export const WELCOME_TEXT =
    'Olá, bem-vindo(a) à *Negra Plena*!\n\n' +
    'A Negra Plena é uma identidade criada a *20 de junho*, dividida em:\n' +
    '• *Cosméticos* — gel de banho, cremes, máscaras, sabonetes…\n' +
    '• *Delícias* — pizza, bolo no pote, doces, salgados, mousse, pudim…\n\n' +
    'O nosso artigo especial: *bolo no pote* 🧁\n\n' +
    'Escolha uma opção no menu:';

export const PRICES_TEXT =
    '*PREÇÁRIO NEGRA PLENA*\n\n' +
    '*Pizzas*\n' +
    '• Pequena — *5.000 Kz*\n' +
    '• Média — *7.000 Kz*\n' +
    '• Grande — *9.500 Kz*\n\n' +
    '*Bolo no pote* — *1.500 Kz*\n\n' +
    '*Por dúzia*\n' +
    '• Mini pizzas — *9.000 Kz*\n' +
    '• Rissóis — *9.000 Kz*\n' +
    '• Enroladinhos pão de chouriço — *10.000 Kz*\n' +
    '• Mini pudim — *12.000 Kz*\n' +
    '• Bolas de Berlim — *12.000 Kz*\n\n' +
    '_Doces:_ bola de Berlim, bolinho, enroladinho de coco…\n' +
    '_Salgados:_ chamuça, pastel de massa tenra, pão/enroladinho de chouriço…';

export const MENU_CATALOG_TEXT =
    '*MENU NEGRA PLENA*\n\n' +
    '*Delícias*\n' +
    'Pizza · Bolo no pote · Doces · Salgados · Mousse · Pudim · Bolas de Berlim\n\n' +
    '*Cosméticos*\n' +
    'Gel de banho · Creme hidratante · Máscara facial · Sabonete hidratante\n\n' +
    `Instagram: ${SOCIAL.instagram}\n` +
    `Facebook: ${SOCIAL.facebook}`;

export type MenuActionId =
    | 'menu_principal'
    | 'ver_menu'
    | 'ver_precos'
    | 'marcar'
    | 'encomendar'
    | 'falar_humano'
    | 'redes';

export const MAIN_MENU_BUTTONS: Array<{ id: MenuActionId; text: string }> = [
    { id: 'ver_menu', text: '📋 Ver menu' },
    { id: 'ver_precos', text: '💰 Preçário' },
    { id: 'marcar', text: '📅 Marcação' },
    { id: 'encomendar', text: '🛒 Solicitar encomenda' },
];

export const FOLLOWUP_BUTTONS: Array<{ id: MenuActionId; text: string }> = [
    { id: 'menu_principal', text: '🏠 Menu principal' },
    { id: 'marcar', text: '📅 Marcação' },
    { id: 'encomendar', text: '🛒 Encomenda' },
    { id: 'falar_humano', text: '👤 Atendimento humano' },
];
