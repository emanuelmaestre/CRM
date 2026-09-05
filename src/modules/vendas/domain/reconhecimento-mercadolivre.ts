/** Datas de aprovação válidas, inclusive de pagamentos posteriormente estornados. */
export function aprovacaoMercadoLivre(order: {
  payments?: Array<{ date_approved?: string | null }>;
}): number | null {
  const datas = (order.payments ?? []).flatMap((p) => {
    const ms = p.date_approved ? Date.parse(p.date_approved) : NaN;
    return Number.isFinite(ms) ? [ms] : [];
  });
  return datas.length ? Math.min(...datas) : null;
}

export function cancelamentoTecnicoML(dados: unknown): boolean {
  if (!dados || typeof dados !== 'object') return false;
  const cancelamento = (dados as { cancelamento?: { code?: string } }).cancelamento;
  return cancelamento?.code === 'pack_splitted';
}
