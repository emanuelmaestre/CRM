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
  const valor = Number((resultado as { progresso?: unknown }).progresso);
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
