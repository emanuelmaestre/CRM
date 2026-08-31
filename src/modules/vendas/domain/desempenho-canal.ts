export type CanalDesempenho = "mercadolivre" | "shopee";

/** Dados reais das APIs; null representa informação ausente, nunca zero. */
export type BaseDesempenhoCanal = {
  vendasBrutas: number;
  unidadesVendidas: number | null;
  quantidadeVendas: number;
  vendasCanceladas: number;
  visitas: number | null;
};

export type IndicadoresDesempenhoCanal = BaseDesempenhoCanal & {
  precoMedioUnidade: number | null;
  precoMedioVenda: number | null;
  conversao: number | null;
};

export type DesempenhoCanal = {
  atual: IndicadoresDesempenhoCanal;
  anterior: IndicadoresDesempenhoCanal | null;
  periodo: { inicio: string; fim: string };
  periodoAnterior: { inicio: string; fim: string };
  avisos: string[];
};

/** Soma as bases antes de dividir, preservando o peso de cada empresa. */
export function consolidarDesempenho(bases: BaseDesempenhoCanal[]): IndicadoresDesempenhoCanal {
  const vendasBrutas = bases.reduce((soma, base) => soma + Math.round(base.vendasBrutas * 100), 0) / 100;
  const quantidadeVendas = bases.reduce((soma, base) => soma + base.quantidadeVendas, 0);
  const vendasCanceladas = bases.reduce((soma, base) => soma + base.vendasCanceladas, 0);
  const somarCompleto = (campo: "visitas" | "unidadesVendidas") => bases.some((base) => base[campo] === null)
    ? null : bases.reduce((soma, base) => soma + base[campo]!, 0);
  const visitas = somarCompleto("visitas");
  const unidadesVendidas = somarCompleto("unidadesVendidas");
  return {
    vendasBrutas, quantidadeVendas, vendasCanceladas, visitas, unidadesVendidas,
    precoMedioUnidade: unidadesVendidas ? vendasBrutas / unidadesVendidas : null,
    precoMedioVenda: quantidadeVendas ? vendasBrutas / quantidadeVendas : null,
    conversao: visitas ? quantidadeVendas / visitas * 100 : null,
  };
}

/** O fim do filtro é inclusivo. Compara com o intervalo anterior adjacente. */
export function periodoAnteriorDesempenho(inicio: Date, fim: Date) {
  const duracao = fim.getTime() - inicio.getTime() + 1;
  return { inicio: new Date(inicio.getTime() - duracao), fim: new Date(fim.getTime() - duracao) };
}

export function variacaoDesempenho(atual: number | null, anterior: number | null, pontos = false): number | null {
  if (atual === null || anterior === null) return null;
  if (pontos) return atual - anterior;
  if (anterior === 0) return atual === 0 ? 0 : null;
  return (atual - anterior) / anterior * 100;
}
