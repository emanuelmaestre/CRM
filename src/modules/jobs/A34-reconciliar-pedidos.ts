import { and, eq, inArray } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import {
  dispararSincronizacaoConta,
  ReconciliacaoAdiadaError,
} from "@/modules/canais/application/sincronizacao.service";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { finalizarJob, iniciarJob } from "./job-monitor";
import { incorporarQuarentenaPedidos } from "@/modules/vendas/application/quarentena-pedidos.service";
import { reprocessarFilaAberta } from "@/modules/vendas/application/pedidos-ignorados.service";
import {
  reconciliacaoFalhouPorCompleto,
  resumirResultadosReconciliacao,
  type ResultadoReconciliacaoConta,
} from "@/modules/canais/domain/resultado-reconciliacao";
import { EVENTO_RECONCILIAR_PEDIDOS } from "./eventos-operacionais";

/* ── Por que este job existe ──────────────────────────────────────
   O caminho normal de um pedido novo é o webhook do canal. A contingência é a
   A24, que roda de 3 em 3 horas com janela de 4 horas. As duas juntas ainda
   deixam um buraco definitivo: webhook perdido MAIS a volta da A24 daquele
   momento tendo falhado (ou a janela já ter passado do pedido) e ninguém mais
   olha pra trás — a próxima volta começa depois dele.

   O buraco é real e foi medido em 28/08/2026 contra a API do Mercado Livre, em
   agosto/2026: 51 pedidos nunca chegaram (WUWU 35, R$ 1.050,21; ARMARINHOS
   LIMA 16, R$ 930,10 — 10% do faturamento do mês daquela marca; KARZI 0). Não
   é um problema de credencial nem de mapeamento: os pedidos simplesmente nunca
   foram pedidos de novo.

   Aqui a varredura olha pra trás alguns dias, todo dia. Reprocessar pedido já
   importado não custa registro nenhum: `ingerirPedido` é idempotente por
   `providerOrderId` — o mesmo motivo pelo qual a A24 se permite sobrepor
   janelas.

   Não refaz a busca por conta própria: emite o mesmo evento da Central de
   Sincronização, e quem executa é a A31, com o módulo "pedidos" só. Toda a
   parte difícil já está lá — uma janela por step, ingestão em lote de 25 (o
   teto de ~1000 steps do Inngest), registro do que foi recusado em
   `pedido_ignorado`. Duplicar isso aqui seria duplicar também os erros que
   custaram caro pra encontrar. */

/** Quantos dias a varredura olha pra trás. Sete cobre um fim de semana inteiro
 *  de webhook mudo mais a folga de perceber; ir muito além disso não aumenta a
 *  chance de achar pedido perdido (a A31 já varre 90 dias quando alguém pede a
 *  fila completa na mão) e só gasta cota do proxy de IP fixo. */
const DIAS_RECONCILIACAO = 7;

export const A34_reconciliarPedidos = inngest.createFunction(
  {
    id: "A34-reconciliar-pedidos",
    name: `A34 — Reconciliação diária de pedidos (últimos ${DIAS_RECONCILIACAO} dias)`,
    concurrency: { limit: 1 },
    triggers: [
      { cron: "0 5 * * *" },
      { event: EVENTO_RECONCILIAR_PEDIDOS },
    ],
  },
  async ({ step, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({
      orgId,
      nome: "A34-reconciliar-pedidos",
      tentativa: attempt,
      payload: { dias: DIAS_RECONCILIACAO },
    }));

    try {
      await step.run("incorporar-quarentena", () => incorporarQuarentenaPedidos(orgId));
      await step.run("reprocessar-pendencias-antigas", () => reprocessarFilaAberta({ orgId }));
      const contas = await step.run("buscar-contas-conectadas", () =>
        db
          .select({ id: channelAccount.id, tipo: channelAccount.tipo, brandSlug: brand.slug })
          .from(channelAccount)
          .innerJoin(brand, and(
            eq(brand.id, channelAccount.brandId),
            eq(brand.orgId, channelAccount.orgId),
          ))
          .where(and(
            eq(channelAccount.orgId, orgId),
            eq(channelAccount.status, "conectado"),
            inArray(channelAccount.tipo, ["mercadolivre", "shopee", "tiktokshop"]),
          )),
      );

      if (contas.length === 0) {
        throw new Error("A34 sem contas de canais de venda conectadas para reconciliar.");
      }

      const desde = new Date(Date.now() - DIAS_RECONCILIACAO * 24 * 60 * 60 * 1_000);
      const ctx: CrudContext = { orgId, perfil: "admin", db };
      const resultados: ResultadoReconciliacaoConta[] = [];

      for (const conta of contas) {
        /* Falha de uma conta não derruba a volta: a próxima conta ainda tem o
           mesmo direito de ser reconciliada, e este job não tem urgência de
           terminar íntegro — se uma conta ficar de fora hoje, amanhã ela é
           varrida de novo com a mesma janela de sete dias.

           O caso mais comum aqui nem é falha: é alguém ter acabado de clicar
           em Sincronizar na Central, e o intervalo mínimo entre verificações
           recusar a segunda pedida. Isso é o sistema funcionando — o dado que
           esta volta traria já está entrando. */
        const resultado = await step.run(`reconciliar-${conta.id}`, async () => {
          try {
            const execucao = await dispararSincronizacaoConta(ctx, conta.id, {
              modulos: ["pedidos"],
              desde,
              reconciliacao: true,
            });
            return { contaId: conta.id, tipo: conta.tipo, marca: conta.brandSlug, execucaoId: execucao.id };
          } catch (error) {
            const motivo = error instanceof Error ? error.message : String(error);
            if (error instanceof ReconciliacaoAdiadaError) {
              console.info(`[A34] conta ${conta.brandSlug}/${conta.tipo} adiada: ${motivo}`);
              return { contaId: conta.id, tipo: conta.tipo, marca: conta.brandSlug, adiada: motivo };
            }
            console.warn(`[A34] conta ${conta.brandSlug}/${conta.tipo} falhou: ${motivo}`);
            return { contaId: conta.id, tipo: conta.tipo, marca: conta.brandSlug, erro: motivo };
          }
        });
        resultados.push(resultado);
      }

      const resumo = {
        dias: DIAS_RECONCILIACAO,
        desde: desde.toISOString(),
        ...resumirResultadosReconciliacao(resultados),
        resultados,
      };

      /* Só falha a volta quando todas as contas tiveram erro real. Adiamento
         por concorrência é esperado, e uma falha isolada não impede que as
         demais contas sejam reconciliadas. O resumo mantém os três desfechos
         separados para não transformar proteção de concorrência em alarme. */
      if (reconciliacaoFalhouPorCompleto(resultados)) {
        throw new Error(
          `A34 incompleta: todas as ${resumo.falhas} conta(s) falharam. Conferir execuções por conta.`,
        );
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return resumo;
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
