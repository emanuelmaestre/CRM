/* ── Fontes de atualidade ───────────────────────────────────────────────
   Cada tela lê de uma ou mais origens de dado. Antes existia uma versão só
   — o maior carimbo de tempo entre tudo — e o efeito colateral aparecia em
   Métricas: um pedido novo mudava a versão global e derrubava o cache dos
   cinco cartões, inclusive os que só dependem de estoque. Aqui a versão é
   por fonte, e cada consumidor assina apenas aquela de que depende. */

export const FONTES_VERSAO = [
  "pedidos",
  "estoque",
  "avaliacoes",
  "anuncios",
  "reputacao",
  "clientes",
  "importacao",
  "auditoria",
  "sincronizacao",
] as const;

export type FonteVersao = (typeof FONTES_VERSAO)[number];
export type VersoesPorFonte = Partial<Record<FonteVersao, string | null>>;

/**
 * Quais fontes mudaram entre duas leituras.
 *
 * Sem leitura anterior devolve lista vazia de propósito: a primeira resposta
 * depois de abrir ou trocar de tela não é "mudou", é "acabei de descobrir".
 * Tratá-la como mudança faria toda tela recarregar os próprios dados logo
 * depois de já tê-los carregado.
 */
export function fontesAlteradas(
  anterior: VersoesPorFonte | null | undefined,
  atual: VersoesPorFonte,
): FonteVersao[] {
  if (!anterior) return [];
  return (Object.keys(atual) as FonteVersao[])
    .filter((fonte) => (anterior[fonte] ?? null) !== (atual[fonte] ?? null));
}

/** Maior carimbo de tempo entre valores ISO. Nulos são ignorados; ordenação
 *  lexicográfica basta porque ISO-8601 em UTC ordena como texto. */
export function maiorVersao(valores: Array<string | null | undefined>): string | null {
  return valores.filter((valor): valor is string => Boolean(valor)).sort().at(-1) ?? null;
}
