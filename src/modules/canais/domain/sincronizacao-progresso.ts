/** Depois disto, uma execução sem `finalizado_em` é considerada abandonada.
 *
 *  Mora no domínio porque três lados precisam concordar sobre o mesmo
 *  número: quem dispara (encerra a morta antes de criar a próxima), quem lê
 *  a última execução, e o painel (que não pode contar morta como ativa —
 *  era o anel parado em 36% com nada rodando). */
export const LIMITE_EXECUCAO_ABANDONADA_MS = 30 * 60 * 1_000;

/** A partir de quando uma execução ainda conta como VIVA.
 *
 *  Uma execução sem `finalizado_em` nem sempre está rodando: o job pode ter
 *  morrido no meio (timeout do Inngest, deploy no meio do caminho) e deixado a
 *  linha aberta para sempre. Quem trata "aberta" como "viva" sem olhar a idade
 *  passa a pular aquela conta em TODA volta seguinte — e a conta some da rotina
 *  sem nenhum erro aparecer, porque a Central só mostra a última sync que
 *  terminou.
 *
 *  Aconteceu com a Shopee/WUWU: duas execuções travadas em 27/08/2026 (uma
 *  aberta por 36h, outra por 60h) tiraram a conta das quatro voltas diárias até
 *  28-29/08, e só um clique manual destravava — o caminho manual já aplicava
 *  esta régua, o cron não. */
export function inicioMinimoExecucaoViva(agora: Date = new Date()): Date {
  return new Date(agora.getTime() - LIMITE_EXECUCAO_ABANDONADA_MS);
}

/** Intervalo mínimo entre duas verificações manuais do mesmo módulo na
 *  mesma conta. Existe pra que dois cliques (ou duas pessoas) não gastem
 *  cota da Shopee/Webshare refazendo em seguida o que acabou de rodar. */
export const INTERVALO_MINIMO_VERIFICACAO_MS = 5 * 60_000;

export const MODULOS_SINCRONIZACAO = [
  "catalogo",
  "pedidos",
  "anuncios",
  "avaliacoes",
  "reputacao",
] as const;

export type ModuloSincronizacao = (typeof MODULOS_SINCRONIZACAO)[number];
export type StatusModuloSincronizacao = "pendente" | "em_andamento" | "concluido" | "erro";

export const CAMPOS_MODULO_SINCRONIZACAO = {
  catalogo: { status: "catalogoStatus", resultado: "catalogoResultado", erro: "catalogoErro" },
  pedidos: { status: "pedidosStatus", resultado: "pedidosResultado", erro: "pedidosErro" },
  anuncios: { status: "anunciosStatus", resultado: "anunciosResultado", erro: "anunciosErro" },
  avaliacoes: { status: "avaliacoesStatus", resultado: "avaliacoesResultado", erro: "avaliacoesErro" },
  reputacao: { status: "reputacaoStatus", resultado: "reputacaoResultado", erro: "reputacaoErro" },
} as const;

export function progressoDoResultado(resultado: unknown): number | null {
  if (!resultado || typeof resultado !== "object" || !("progresso" in resultado)) return null;
  const bruto = (resultado as { progresso?: unknown }).progresso;
  // A chave pode existir valendo null — é o que o resumo montado no banco
  // devolve para um módulo sem progresso registrado. Number(null) é 0, e
  // sem esta guarda um módulo "sem progresso" viraria "progresso zero".
  if (bruto === null || bruto === undefined) return null;
  const valor = Number(bruto);
  if (!Number.isFinite(valor)) return null;
  return Math.max(0, Math.min(100, Math.round(valor)));
}

export function resultadoOmitido(resultado: unknown): boolean {
  return Boolean(
    resultado
      && typeof resultado === "object"
      && (("omitido" in resultado && (resultado as { omitido?: unknown }).omitido === true)
        || ("desativado" in resultado && (resultado as { desativado?: unknown }).desativado === true)),
  );
}

export function progressoDoModulo(status: StatusModuloSincronizacao, resultado: unknown): number {
  const registrado = progressoDoResultado(resultado);
  if (status === "concluido") return 100;
  if (status === "erro") return Math.min(99, registrado ?? 45);
  if (status === "em_andamento") return Math.max(1, Math.min(99, registrado ?? 5));
  return registrado ?? 0;
}

type ExecucaoProgresso = Partial<Record<string, unknown>>;

/** Progresso da execução, ponderado somente pelos módulos realmente pedidos.
 *  Módulo omitido não entra no denominador — uma atualização só de Vendas
 *  começa em 0% e termina em 100%, em vez de parecer 80% pronta antes de
 *  começar por causa dos quatro módulos que não foram solicitados. */
export function calcularProgressoExecucao(execucao: ExecucaoProgresso | null | undefined): number {
  if (!execucao) return 0;
  const modulos = MODULOS_SINCRONIZACAO.flatMap((modulo) => {
    const campos = CAMPOS_MODULO_SINCRONIZACAO[modulo];
    const resultado = execucao[campos.resultado];
    if (resultadoOmitido(resultado)) return [];
    const status = execucao[campos.status] as StatusModuloSincronizacao | undefined;
    return status ? [{ status, resultado }] : [];
  });
  if (modulos.length === 0) return 100;
  const total = modulos.reduce((soma, item) => soma + progressoDoModulo(item.status, item.resultado), 0);
  return Math.max(0, Math.min(100, Math.round(total / modulos.length)));
}
