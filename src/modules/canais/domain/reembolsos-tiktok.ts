export interface ReembolsoTikTok {
  id: string;
  orderId: string;
  status: string;
  tipo: string;
  valor: number;
  subtotal: number;
  frete: number;
  atualizadoEmMs: number;
}

export interface RetornoTikTokApi {
  return_id: string;
  order_id: string;
  return_status: string;
  return_type: string;
  update_time: number;
  refund_amount?: { currency?: string; refund_total?: string; refund_subtotal?: string; refund_shipping_fee?: string };
}

export const REEMBOLSO_TIKTOK_CONCLUIDO = "RETURN_OR_REFUND_REQUEST_COMPLETE";

export function normalizarReembolsoTikTok(retorno: RetornoTikTokApi): ReembolsoTikTok {
  const dinheiro = (valor: string | undefined, obrigatorio = false) => {
    if (obrigatorio && (valor === undefined || valor.trim() === "")) throw new Error("TikTok: reembolso concluído sem valor.");
    const n = Number(valor ?? 0);
    if (!Number.isFinite(n) || n < 0) throw new Error("TikTok: valor de reembolso inválido.");
    return Math.round(n * 100) / 100;
  };
  const concluido = retorno.return_status === REEMBOLSO_TIKTOK_CONCLUIDO;
  if (!retorno.return_id || !retorno.order_id || !retorno.return_status || !Number.isFinite(retorno.update_time)
    || (concluido && retorno.refund_amount?.currency !== "BRL")) {
    throw new Error("TikTok: devolução sem identificação, versão ou moeda BRL.");
  }
  return {
    id: retorno.return_id, orderId: retorno.order_id, status: retorno.return_status,
    tipo: retorno.return_type, atualizadoEmMs: retorno.update_time * 1000,
    valor: dinheiro(retorno.refund_amount?.refund_total, concluido),
    subtotal: dinheiro(retorno.refund_amount?.refund_subtotal),
    frete: dinheiro(retorno.refund_amount?.refund_shipping_fee),
  };
}

/** Mescla por caso, sem apagar reembolsos antigos fora da janela de atualização. */
export function mesclarReembolsosTikTok(anteriores: ReembolsoTikTok[], recebidos: ReembolsoTikTok[]): ReembolsoTikTok[] {
  const casos = new Map(anteriores.map((r) => [r.id, r]));
  for (const r of recebidos) {
    const anterior = casos.get(r.id);
    if (!anterior || r.atualizadoEmMs >= anterior.atualizadoEmMs) casos.set(r.id, r);
  }
  return [...casos.values()].sort((a, b) => a.id.localeCompare(b.id));
}
