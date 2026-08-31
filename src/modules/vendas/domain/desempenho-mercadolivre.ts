/** Indicadores reconstruídos das APIs públicas; não são o relatório interno de Métricas. */
export type BaseDesempenhoML = {
  vendasBrutas: number;
  unidadesVendidas: number | null;
  quantidadeVendas: number;
  vendasCanceladas: number;
  visitas: number | null;
};

export type IndicadoresDesempenhoML = BaseDesempenhoML & {
  precoMedioUnidade: number | null;
  precoMedioVenda: number | null;
  conversao: number | null;
};

export type DesempenhoMercadoLivre = {
  atual: IndicadoresDesempenhoML;
  anterior: IndicadoresDesempenhoML | null;
  periodo: { inicio: string; fim: string };
  periodoAnterior: { inicio: string; fim: string };
  avisos: string[];
};

/** Soma as bases antes de dividir: médias de lojas diferentes têm pesos diferentes.
 * Uma loja sem visitas/unidades invalida o total desse campo, nunca vira zero. */
export function consolidarDesempenhoML(bases: BaseDesempenhoML[]): IndicadoresDesempenhoML {
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

/** A API de visitas aceita apenas datas e retorna dias UTC-4 (validado em
 * 30/08/2026). Os cards usam esse calendário; a conferência permanece UTC-3. */
export function periodoDesempenhoML(inicio: Date, fim: Date) {
  const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  const dataInicio = data.format(inicio);
  const dataFim = data.format(fim);
  return { dataInicio, dataFim, inicio: new Date(`${dataInicio}T00:00:00-04:00`), fim: new Date(`${dataFim}T23:59:59.999-04:00`) };
}

/** Comparação por dias inteiros: visitas não aceitam cortes por hora. */
export function periodoAnteriorML(inicio: Date, fim: Date) {
  const duracao = fim.getTime() - inicio.getTime() + 1;
  return {
    inicio: new Date(inicio.getTime() - duracao),
    fim: new Date(fim.getTime() - duracao),
  };
}

export function variacaoDesempenhoML(atual: number | null, anterior: number | null, pontos = false): number | null {
  if (atual === null || anterior === null) return null;
  if (pontos) return atual - anterior;
  if (anterior === 0) return atual === 0 ? 0 : null;
  return (atual - anterior) / anterior * 100;
}
