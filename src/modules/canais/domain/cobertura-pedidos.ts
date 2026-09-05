/** O progresso persistido não é o horário do último webhook. */
export function inicioColetaPedidos(agoraMs: number, ultimoSucesso: unknown, janelaInicialMs: number): Date {
  const anterior = typeof ultimoSucesso === "string" ? Date.parse(ultimoSucesso) : NaN;
  if (!Number.isFinite(anterior) || anterior > agoraMs) return new Date(agoraMs - janelaInicialMs);
  return new Date(Math.min(agoraMs - janelaInicialMs, anterior - 60 * 60_000));
}

/** A cobertura só pode avançar se todo pedido recusado já tiver uma cópia
 * durável em `pedido_ignorado`. Erro sem registro ainda depende da mesma
 * janela para ser visto novamente. */
export function podeAvancarCoberturaPedidos(falhasSemRegistro: number): boolean {
  return Number.isInteger(falhasSemRegistro) && falhasSemRegistro === 0;
}

/** Define qual relógio do marketplace cobre a intenção da sincronização.
 *
 * - atualização incremental: procura o que MUDOU na janela (pedido antigo cujo
 *   pagamento foi aprovado agora, cancelamento tardio, reembolso etc.);
 * - reconciliação/backfill: procura o que foi CRIADO no período histórico.
 *
 * Usar criação na atualização de 24h abre um buraco especialmente traiçoeiro:
 * um pedido criado há três dias e pago hoje não aparece nem como novo nem como
 * pendência, embora o botão informe que acabou de atualizar os pedidos. */
export function campoDataDaSincronizacaoPedidos(
  desdeExplicito: unknown,
  reconciliacao: boolean,
): "criacao" | "atualizacao" {
  return typeof desdeExplicito === "string" && !reconciliacao
    ? "atualizacao"
    : "criacao";
}

/** Política isolada: ML mantém a escolha e otimização anteriores. */
export function politicaColetaPedidos(canal: string, desde: unknown, reconciliacao: boolean) {
  const coletaIntegral = canal === "shopee" || canal === "tiktokshop";
  return {
    campoData: coletaIntegral && !reconciliacao ? "atualizacao" as const
      : campoDataDaSincronizacaoPedidos(desde, reconciliacao),
    relerTodos: reconciliacao || coletaIntegral,
    exigirSemPendencias: coletaIntegral,
  };
}
