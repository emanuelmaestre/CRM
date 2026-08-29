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
  /** Idade do dado que ficou na tela quando a confirmação falhou. É o que a
   *  tarja mostra — "dados de 10h32" — em vez de esconder tudo. */
  confirmadoAte?: string | null;
  /** Quem não respondeu, pelo nome que a pessoa conhece ("Mercado Livre").
   *  Sem isto a tarja só sabe dizer que "não deu", e quem lê não tem como
   *  saber se a tela inteira está velha ou só a metade de um canal. */
  canais?: string[];
  /** Quanto falta, em segundos, para o servidor voltar a aceitar uma
   *  verificação. Enquanto correr, mandar confirmar de novo devolve o mesmo
   *  erro — e é isso que desliga o botão da tarja em vez de deixá-lo
   *  prometendo o que não entrega. */
  esperarSegundos?: number;
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
    /* `ultimaConfirmacao`, não `ultimoSucesso`: o caminho normal de um pedido
       é o webhook, que não escreve execução nenhuma. Medir o frescor só pela
       Central fazia o portão declarar "vencido" cinco minutos depois de cada
       A31 e mandar buscar de novo o pedido que já estava no banco — uma
       sincronização por entrada de tela, que é exatamente o gasto de cota que
       este serviço existe para evitar. */
    const confirmado = dataValida(item.ultimaConfirmacao ?? item.ultimoSucesso);
    return confirmado !== null && agora - confirmado <= FRESCOR_AUTOMATICO_MS[item.modulo]
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

  /* Quem não pode disparar sincronização não pode destravar a própria tela.
     Prendê-lo atrás da porcentagem seria um bloqueio sem saída — o vendedor
     ficaria olhando 0% para sempre. Ele vê o dado que existe; quem confirma
     é o gestor, pela mesma rotina. */
  if (!painel.podeSincronizar) {
    return {
      tela: painel.tela,
      situacao: "pronto",
      progresso: 100,
      versao: painel.versao,
      versoes: painel.versoes,
      fontes: Object.keys(painel.versoes) as Array<keyof PainelAtualizacao["versoes"]>,
    };
  }

  const esperar = esperaParaNovaTentativa(vencidos);

  return {
    tela: painel.tela,
    situacao: algumaExecucaoViva ? "atualizando" : temFalha ? "erro" : "pendente",
    progresso: Math.max(0, Math.min(99, progresso)),
    versao: painel.versao,
    versoes: painel.versoes,
    fontes: Object.keys(painel.versoes) as Array<keyof PainelAtualizacao["versoes"]>,
    ...(esperar > 0 ? { esperarSegundos: esperar } : {}),
    ...(temFalha && !algumaExecucaoViva
      ? {
        mensagem: "Não foi possível atualizar agora.",
        /* A idade do dado que continua na tela. Sem isto a tarja teria que
           dizer só "falhou", e o operador não saberia se está olhando o de
           dez minutos atrás ou o de ontem. */
        confirmadoAte: confirmacaoMaisAntiga(vencidos),
        canais: canaisEmFalha(painel, vencidos),
      }
      : {}),
  };
}

/** Quanto falta para o intervalo mínimo de verificação liberar uma nova
 *  tentativa — o maior entre os módulos vencidos, porque basta um ainda
 *  bloqueado para a confirmação voltar incompleta.
 *
 *  A fila recusa quem pede de novo dentro do intervalo, e essa recusa chegava
 *  na tela como o mesmo "não foi possível" de sempre: o botão "Tentar
 *  novamente" era uma promessa que só sabia falhar, e a pessoa clicava várias
 *  vezes até desistir. Com o prazo na mão, a tarja mostra o relógio. */
function esperaParaNovaTentativa(
  vencidos: Array<{ conta: PainelAtualizacao["contas"][number]; modulo: ModuloSincronizacao }>,
): number {
  return vencidos.reduce((maior, { conta, modulo }) => {
    const item = conta.atualidade.find((linha) => linha.modulo === modulo);
    return Math.max(maior, item?.esperarSegundos ?? 0);
  }, 0);
}

/** Os canais que de fato falharam entre os vencidos, sem repetir marca. */
function canaisEmFalha(
  painel: PainelAtualizacao,
  vencidos: Array<{ conta: PainelAtualizacao["contas"][number]; modulo: ModuloSincronizacao }>,
): string[] {
  return [...new Set(
    painel.falhas
      .filter((falha) => vencidos.some(({ conta }) => conta.id === falha.contaId))
      .map((falha) => falha.canalLabel),
  )];
}

/** O carimbo mais ATRASADO entre os módulos que falharam — é ele que
 *  descreve honestamente a tela, não o mais recente. */
function confirmacaoMaisAntiga(
  vencidos: Array<{ conta: PainelAtualizacao["contas"][number]; modulo: ModuloSincronizacao }>,
): string | null {
  const carimbos = vencidos.flatMap(({ conta, modulo }) => {
    const item = conta.atualidade.find((linha) => linha.modulo === modulo);
    const valor = item?.ultimaConfirmacao ?? item?.ultimoSucesso ?? null;
    return valor ? [valor] : [];
  });
  return carimbos.length === 0 ? null : carimbos.sort()[0];
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
 * Roda com o perfil real de quem abriu a tela. Uma cópia do contexto com
 * perfil administrativo passaria por cima do `assertPerfil` da fila e faria
 * qualquer pessoa logada disparar chamadas de marketplace só por navegar —
 * logo depois de o botão manual ter sido retirado das telas justamente para
 * concentrar essa decisão. Perfil sem permissão não dispara nada e também não
 * fica preso: `resumirEstado` devolve "pronto" para ele.
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
  if (!painel.podeSincronizar) return resumirEstado(painel);

  for (const conta of painel.contas) {
    const vencidos = modulosVencidos(conta, agora);
    if (vencidos.length === 0 || execucaoViva(conta, agora)) continue;
    try {
      await dispararSincronizacaoConta(ctx, conta.id, {
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
