export type JanelaPedidos = { inicioMs: number; fimMs: number };

export function fatiarJanelasPedidos(
  janelas: JanelaPedidos[],
  maximoMs: number,
): JanelaPedidos[] {
  if (!Number.isFinite(maximoMs) || maximoMs <= 0) {
    throw new Error("A duração máxima da janela de pedidos deve ser positiva.");
  }

  const partes: JanelaPedidos[] = [];
  let processadoAte = Number.NEGATIVE_INFINITY;

  for (const janela of janelas) {
    if (!Number.isFinite(janela.inicioMs) || !Number.isFinite(janela.fimMs)) {
      throw new Error("A janela de pedidos deve ter limites válidos.");
    }

    let inicioMs = Math.max(janela.inicioMs, processadoAte);
    while (inicioMs < janela.fimMs) {
      const fimMs = Math.min(janela.fimMs, inicioMs + maximoMs);
      partes.push({ inicioMs, fimMs });
      inicioMs = fimMs;
    }
    processadoAte = Math.max(processadoAte, janela.fimMs);
  }

  return partes;
}
