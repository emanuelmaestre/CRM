/** Continuação anunciada pelo canal não pode virar sucesso com dados parciais. */
export function proximoCursorSeguro(atual: string, proximo: string | undefined, mais: boolean | undefined, vistos: Set<string>, origem: string): string | null {
  if (!mais) return null;
  if (!proximo || proximo === atual || vistos.has(proximo)) {
    throw new Error(`${origem}: paginação incompleta (cursor ausente ou repetido).`);
  }
  vistos.add(proximo);
  return proximo;
}
