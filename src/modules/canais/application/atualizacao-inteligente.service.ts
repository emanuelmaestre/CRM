import "server-only";

import type { CrudContext } from "@/shared/lib/crud-factory";
import {
  MODULOS_EXTERNOS_POR_TELA,
  obterPainelAtualizacao,
  type PainelAtualizacao,
  type TelaAtualizavel,
} from "./painel-atualizacao.service";
import { dispararSincronizacaoConta } from "./sincronizacao.service";
import {
  LIMITE_EXECUCAO_ABANDONADA_MS,
  type ModuloSincronizacao,
} from "../domain/sincronizacao-progresso";

/**
 * Janela em que uma confirmação continua válida para a entrada da tela.
 *
 * Pedidos têm janela curta porque mudam durante o expediente. Os demais
 * módulos já possuem rotinas próprias e são caros (catálogo da Shopee, por
 * exemplo, consulta as variações de cada anúncio); a folga maior evita que a
 * navegação do operador transforme uma leitura em uma varredura completa.
 */
export const FRESCOR_AUTOMATICO_MS: Record<ModuloSincronizacao, number> = {
  pedidos: 5 * 60_000,
  catalogo: 8 * 60 * 60_000,
  avaliacoes: 8 * 60 * 60_000,
  reputacao: 8 * 60 * 60_000,
  anuncios: 30 * 60 * 60_000,
};

export type SituacaoAtualizacaoTela = "pronto" | "atualizando" | "pendente" | "erro";

export interface EstadoAtualizacaoTela {
  tela: TelaAtualizavel;
  situacao: SituacaoAtualizacaoTela;
  progresso: number;
  versao: string | null;
  versoes: PainelAtualizacao["versoes"];
  fontes: Array<keyof PainelAtualizacao["versoes"]>;
  mensagem?: string;
}
function dataValida(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const ms = new Date(valor).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function execucaoViva(conta: PainelAtualizacao["contas"][number], agora: number): boolean {
  const execucao = conta.execucao;
  if (!execucao || execucao.finalizadoEm) return false;
  return agora - new Date(execucao.iniciadoEm).getTime() <= LIMITE_EXECUCAO_ABANDONADA_MS;
}

function modulosVencidos(
  conta: PainelAtualizacao["contas"][number],
  agora: number,
): ModuloSincronizacao[] {
  return conta.atualidade.flatMap((item) => {
    const sucesso = dataValida(item.ultimoSucesso);
    return sucesso !== null && agora - sucesso <= FRESCOR_AUTOMATICO_MS[item.modulo]
      ? []
      : [item.modulo];
  });
}

function progressoDaConta(
  conta: PainelAtualizacao["contas"][number],
  modulo: ModuloSincronizacao,
  vencido: boolean,
): number {
  if (!vencido) return 100;
  const emExecucao = conta.execucao?.modulos.find((item) => item.modulo === modulo);
  return emExecucao?.progresso ?? 0;
}

function resumirEstado(painel: PainelAtualizacao): EstadoAtualizacaoTela {
  const agora = Date.now();
  const exigencias = painel.contas.flatMap((conta) =>
    conta.atualidade.map((item) => ({ conta, modulo: item.modulo })),
  );

  if (exigencias.length === 0) {
    return {
      tela: painel.tela,
      situacao: "pronto",
      progresso: 100,
      versao: painel.versao,
      versoes: painel.versoes,
      fontes: Object.keys(painel.versoes) as Array<keyof PainelAtualizacao["versoes"]>,
    };
  }

  const vencidosPorConta = new Map(
    painel.contas.map((conta) => [conta.id, new Set(modulosVencidos(conta, agora))]),
  );
  const vencidos = exigencias.filter(({ conta, modulo }) => vencidosPorConta.get(conta.id)?.has(modulo));
  const progresso = Math.round(exigencias.reduce((soma, { conta, modulo }) => (
    soma + progressoDaConta(conta, modulo, vencidosPorConta.get(conta.id)?.has(modulo) ?? false)
  ), 0) / exigencias.length);

  if (vencidos.length === 0) {
    return {
      tela: painel.tela,
      situacao: "pronto",
      progresso: 100,
      versao: painel.versao,
      versoes: painel.versoes,
      fontes: Object.keys(painel.versoes) as Array<keyof PainelAtualizacao["versoes"]>,
    };
  }

  const algumaExecucaoViva = painel.contas.some((conta) => execucaoViva(conta, agora));
  const temFalha = painel.falhas.some((falha) =>
    vencidos.some(({ conta }) => conta.id === falha.contaId),
  );

  return {
    tela: painel.tela,
    situacao: algumaExecucaoViva ? "atualizando" : temFalha ? "erro" : "pendente",
    progresso: Math.max(0, Math.min(99, progresso)),
    versao: painel.versao,
    versoes: painel.versoes,
    fontes: Object.keys(painel.versoes) as Array<keyof PainelAtualizacao["versoes"]>,
    ...(temFalha && !algumaExecucaoViva
      ? { mensagem: "Não foi possível atualizar agora." }
      : {}),
  };
}

export async function obterEstadoAtualizacaoTela(
  ctx: CrudContext,
  tela: TelaAtualizavel,
): Promise<EstadoAtualizacaoTela> {
  return resumirEstado(await obterPainelAtualizacao(ctx, tela));
}

/**
 * Confirma a entrada da tela sem executar sincronização completa.
 *
 * A autorização da rota já confirmou o usuário e a organização. A cópia do
 * contexto com perfil administrativo é interna e serve apenas para reutilizar
 * a fila protegida; nenhum perfil adicional é concedido ao navegador.
 */
export async function iniciarAtualizacaoTela(
  ctx: CrudContext,
  tela: TelaAtualizavel,
): Promise<EstadoAtualizacaoTela> {
  if (MODULOS_EXTERNOS_POR_TELA[tela].length === 0) {
    return obterEstadoAtualizacaoTela(ctx, tela);
  }

  const painel = await obterPainelAtualizacao(ctx, tela);
  const agora = Date.now();
  const erros: unknown[] = [];
  const contextoInterno: CrudContext = { ...ctx, perfil: "admin" };

  for (const conta of painel.contas) {
    const vencidos = modulosVencidos(conta, agora);
    if (vencidos.length === 0 || execucaoViva(conta, agora)) continue;
    try {
      await dispararSincronizacaoConta(contextoInterno, conta.id, {
        modulos: vencidos,
        // Webhook é a via principal. Se ele atrasar, seis horas de sobreposição
        // são suficientes para recuperar o pedido sem reler um dia inteiro a
        // cada entrada. A reconciliação diária continua cobrindo sete dias.
        desde: vencidos.includes("pedidos")
          ? new Date(agora - 6 * 60 * 60_000)
          : undefined,
      });
    } catch (error) {
      erros.push(error);
    }
  }

  const estado = resumirEstado(await obterPainelAtualizacao(ctx, tela));
  if (erros.length > 0 && estado.situacao !== "atualizando" && estado.situacao !== "pronto") {
    return { ...estado, situacao: "erro", mensagem: "Não foi possível atualizar agora." };
  }
  return estado;
}
