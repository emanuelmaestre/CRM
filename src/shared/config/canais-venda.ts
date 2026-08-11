// Ordem de venda fechada do PRD (§M3): Mercado Livre, Shopee, TikTok Shop —
// Olist fica de fora do seletor porque não é canal de anúncio próprio (é hub).
// Fonte única para os seletores de canal do Estoque e de Clientes — os dois
// filtram pelo mesmo conjunto fechado de canais de venda.
export const CANAIS_VENDA = ["mercadolivre", "shopee", "tiktokshop"] as const;

export type CanalVenda = (typeof CANAIS_VENDA)[number];
