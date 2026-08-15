export type FaixaGiro = { vendaMensalMinima: number; minimo: number };

export type ReguaEstoque =
  | { tipo: "fixo"; minimo: number }
  | { tipo: "giro"; faixas: FaixaGiro[] };

export const FAIXAS_GIRO_PADRAO: FaixaGiro[] = [
  { vendaMensalMinima: 10, minimo: 12 },
  { vendaMensalMinima: 3, minimo: 4 },
  { vendaMensalMinima: 1, minimo: 2 },
  { vendaMensalMinima: 0, minimo: 0 },
];

export function minimoPelaRegua(regua: ReguaEstoque, giroMensal: number): number {
  if (regua.tipo === "fixo") return regua.minimo;

  const faixas = [...regua.faixas].sort((a, b) => b.vendaMensalMinima - a.vendaMensalMinima);
  for (const faixa of faixas) {
    if (giroMensal >= faixa.vendaMensalMinima) return faixa.minimo;
  }
  return 0;
}

/** Mantém as situações mutuamente exclusivas usadas pelos cards e pelo wizard. */
export function classificarEstoqueComRegua(saldo: number, minimo: number) {
  if (saldo <= 0) return "sem_estoque" as const;
  if (minimo > 0 && saldo <= minimo) return "abaixo_minimo" as const;
  if (minimo <= 0) return "sem_alerta" as const;
  return "ok" as const;
}
