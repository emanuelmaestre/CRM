// Ordem de venda fechada: Mercado Livre, Shopee e TikTok Shop.
// Fonte única para os seletores de canal do Estoque e de Clientes — os dois
// filtram pelo mesmo conjunto fechado de canais de venda.
export const CANAIS_VENDA = ["mercadolivre", "shopee", "tiktokshop"] as const;

export type CanalVenda = (typeof CANAIS_VENDA)[number];
