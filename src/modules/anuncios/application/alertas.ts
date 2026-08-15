/* ── Central de Alertas (Fase 3) ──────────────────────────────────
   Traduz diagnósticos e oportunidades em alertas priorizados — mas o
   brief é categórico: "quero sinal, não ruído". Por isso a peça central
   deste arquivo não é gerar alerta, é DEDUPLICAR: mesma campanha, mesmo
   tipo de problema, gerado ontem e hoje de novo, não deveria virar dois
   alertas — deveria continuar sendo o mesmo, só com a data atualizada. */

import type { Diagnostico } from "./motor-diagnostico";
import type { Oportunidade } from "./oportunidades";

export type PrioridadeAlerta = "critico" | "importante" | "oportunidade" | "informativo";

export interface Alerta {
  /** Determinística a partir de (tipo + campanha) — é o que permite
   *  deduplicar sem precisar de um ID gerado em algum outro lugar. */
  chave: string;
  prioridade: PrioridadeAlerta;
  campanhaId: string;
  campanhaNome: string;
  titulo: string;
  descricao: string;
  geradoEm: Date;
}

const SEVERIDADE_PARA_PRIORIDADE: Record<Diagnostico["severidade"], PrioridadeAlerta> = {
  critico: "critico",
  atencao: "importante",
  oportunidade: "oportunidade",
};

function chaveAlerta(campanhaId: string, tipo: string): string {
  return `${campanhaId}:${tipo}`;
}

/** Converte diagnósticos de uma campanha em alertas — 1 para 1, cada
 *  Diagnostico já carrega o texto pronto (motor-diagnostico.ts). */
export function alertasDeDiagnosticos(
  campanhaId: string,
  campanhaNome: string,
  diagnosticos: Diagnostico[],
  agora: Date = new Date(),
): Alerta[] {
  return diagnosticos.map((diagnostico) => ({
    chave: chaveAlerta(campanhaId, diagnostico.tipo),
    prioridade: SEVERIDADE_PARA_PRIORIDADE[diagnostico.severidade],
    campanhaId,
    campanhaNome,
    titulo: diagnostico.titulo,
    descricao: diagnostico.acaoDesencorajada
      ? `${diagnostico.explicacao} ${diagnostico.acaoDesencorajada}`
      : `${diagnostico.explicacao} ${diagnostico.acaoRecomendada}`,
    geradoEm: agora,
  }));
}

/** Mesma conversão para oportunidades — sempre prioridade "oportunidade",
 *  já que por definição não é problema, é chance de melhorar. */
export function alertasDeOportunidades(oportunidades: Oportunidade[], agora: Date = new Date()): Alerta[] {
  return oportunidades.map((oportunidade) => ({
    chave: chaveAlerta(oportunidade.campanhaId, `oportunidade_${oportunidade.tipo}`),
    prioridade: "oportunidade",
    campanhaId: oportunidade.campanhaId,
    campanhaNome: oportunidade.campanhaNome,
    titulo: oportunidade.titulo,
    descricao: oportunidade.explicacao,
    geradoEm: agora,
  }));
}

/** Janela de silêncio: o mesmo alerta (mesma chave) só reaparece na lista
 *  se já se passou o cooldown desde a última vez que apareceu. Isto é o
 *  que impede a Central de Alertas de mostrar "campanha X sem conversão"
 *  todo santo dia enquanto o problema não muda — o alerta persiste no
 *  fundo, mas só "acende" de novo depois do intervalo. */
export function aplicarCooldown(
  alertasNovos: Alerta[],
  ultimaOcorrenciaPorChave: Map<string, Date>,
  cooldownHoras: number,
  agora: Date = new Date(),
): Alerta[] {
  const limiteMs = cooldownHoras * 60 * 60 * 1000;
  return alertasNovos.filter((alerta) => {
    const ultima = ultimaOcorrenciaPorChave.get(alerta.chave);
    if (!ultima) return true;
    return agora.getTime() - ultima.getTime() >= limiteMs;
  });
}

/** Remove duplicata dentro do próprio lote (a mesma campanha pode gerar o
 *  mesmo tipo de diagnóstico por duas vias diferentes — ex.: uma regra do
 *  motor e uma leitura manual futura). Mantém a ocorrência mais recente. */
export function deduplicarLote(alertas: Alerta[]): Alerta[] {
  const porChave = new Map<string, Alerta>();
  for (const alerta of alertas) {
    const existente = porChave.get(alerta.chave);
    if (!existente || alerta.geradoEm > existente.geradoEm) porChave.set(alerta.chave, alerta);
  }
  return [...porChave.values()];
}

/** Agrupa alertas do mesmo tipo entre campanhas diferentes — "12 campanhas
 *  com perda por orçamento" em vez de 12 linhas repetidas. Devolve os
 *  grupos com 2+ ocorrências separados dos alertas que continuam
 *  individuais (grupo de 1 não é grupo, é só o alerta). */
export interface GrupoAlertas {
  tituloBase: string;
  prioridade: PrioridadeAlerta;
  alertas: Alerta[];
}

export function agruparAlertasSemelhantes(alertas: Alerta[]): { individuais: Alerta[]; grupos: GrupoAlertas[] } {
  const porTitulo = new Map<string, Alerta[]>();
  for (const alerta of alertas) {
    const lista = porTitulo.get(alerta.titulo) ?? [];
    lista.push(alerta);
    porTitulo.set(alerta.titulo, lista);
  }

  const individuais: Alerta[] = [];
  const grupos: GrupoAlertas[] = [];
  for (const [titulo, lista] of porTitulo) {
    if (lista.length >= 2) {
      grupos.push({ tituloBase: titulo, prioridade: lista[0].prioridade, alertas: lista });
    } else {
      individuais.push(...lista);
    }
  }
  return { individuais, grupos };
}

const ORDEM_PRIORIDADE: Record<PrioridadeAlerta, number> = {
  critico: 0,
  importante: 1,
  oportunidade: 2,
  informativo: 3,
};

/** Pipeline completo: dedup no lote → cooldown contra o histórico →
 *  agrupamento → ordenado por prioridade. É o que a Central de Alertas e
 *  o card "Precisa da sua atenção" (Visão Geral) devem consumir — nunca a
 *  lista de alertas crua. */
export function processarAlertas(
  alertasBrutos: Alerta[],
  ultimaOcorrenciaPorChave: Map<string, Date>,
  cooldownHoras: number,
  agora: Date = new Date(),
): { individuais: Alerta[]; grupos: GrupoAlertas[] } {
  const semDuplicataNoLote = deduplicarLote(alertasBrutos);
  const foraDoCooldown = aplicarCooldown(semDuplicataNoLote, ultimaOcorrenciaPorChave, cooldownHoras, agora);
  const { individuais, grupos } = agruparAlertasSemelhantes(foraDoCooldown);

  return {
    individuais: individuais.sort((a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]),
    grupos: grupos.sort((a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]),
  };
}
