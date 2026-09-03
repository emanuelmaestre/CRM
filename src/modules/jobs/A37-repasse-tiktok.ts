import { and, eq } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import {
  conciliarRepassesTikTok,
  DIAS_REPASSE_TIKTOK,
  type ResumoRepasseTikTok,
} from "@/modules/canais/application/repasse-tiktok.service";
import { isBrandSlug } from "@/shared/config/brands";
import { finalizarJob, iniciarJob } from "./job-monitor";
import { EVENTO_REPASSE_TIKTOK } from "./eventos-operacionais";

/* ── Por que este job existe ──────────────────────────────────────
   O TikTok é o único canal em que o líquido não chega junto com o pedido: a
   API de pedidos não expõe retenção nenhuma e o extrato só nasce quando a
   plataforma paga, dias depois da venda. Enquanto ninguém completa esse campo,
   `liquidoDoPedido` cai na reconstrução por cima — total menos frete — e o
   lucro do canal em Métricas fica inflado pelas taxas que ninguém descontou.
   Medido em 03/09/2026 contra extratos reais: 24% a 29% do bruto.

   É o equivalente do escrow da Shopee, com a diferença de que lá o número dá
   para buscar junto do pedido e aqui não. Roda depois da A34 (05:00) e da A35
   (06:00): a A34 pode ter trazido pedido novo, e a A35 confere o bruto — este
   completa o líquido de quem já está gravado.

   Uma conta por `step.run`: cada loja é uma varredura de extratos inteira, e
   step grande demais estoura o tempo e faz o Inngest reexecutar o job do zero,
   refazendo as chamadas e queimando a cota do proxy. Falha de uma loja não
   derruba as outras — o líquido é complemento, não a entrada do pedido. */

export const A37_repasseTikTok = inngest.createFunction(
  {
    id: "A37-repasse-tiktok",
    name: `A37 — Repasse do TikTok Shop (últimos ${DIAS_REPASSE_TIKTOK} dias)`,
    concurrency: { limit: 1 },
    triggers: [
      { cron: "0 7 * * *" },
      { event: EVENTO_REPASSE_TIKTOK },
    ],
  },
  async ({ step, event, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({
      orgId,
      nome: "A37-repasse-tiktok",
      tentativa: attempt,
    }));

    try {
      /* Disparo manual pode pedir uma janela maior — é o caminho do
         backfill histórico, que precisa varrer o trimestre inteiro uma vez. */
      const dias = Number((event?.data as { dias?: unknown } | undefined)?.dias) || DIAS_REPASSE_TIKTOK;

      const contas = await step.run("buscar-contas-tiktok", () =>
        db
          .select({ id: channelAccount.id, brandSlug: brand.slug })
          .from(channelAccount)
          .innerJoin(brand, and(
            eq(brand.id, channelAccount.brandId),
            eq(brand.orgId, channelAccount.orgId),
          ))
          .where(and(
            eq(channelAccount.orgId, orgId),
            eq(channelAccount.tipo, "tiktokshop"),
            eq(channelAccount.status, "conectado"),
          )),
      );

      if (contas.length === 0) {
        throw new Error("A37 sem contas TikTok Shop conectadas.");
      }

      const porConta: Array<{ contaId: string; marca: string; resumo?: ResumoRepasseTikTok; erro?: string }> = [];
      for (const conta of contas) {
        const resultado = await step.run(`repasse-${conta.id}`, async () => {
          try {
            if (!isBrandSlug(conta.brandSlug)) {
              throw new Error(`Marca desconhecida para a conta ${conta.id}: ${conta.brandSlug}`);
            }
            const resumo = await conciliarRepassesTikTok({
              orgId,
              channelAccountId: conta.id,
              brandSlug: conta.brandSlug,
              desde: new Date(Date.now() - dias * 24 * 60 * 60 * 1000),
            });
            return { contaId: conta.id, marca: conta.brandSlug, resumo };
          } catch (error) {
            const erro = error instanceof Error ? error.message : String(error);
            console.warn(`[A37] conta ${conta.brandSlug} pulada: ${erro}`);
            return { contaId: conta.id, marca: conta.brandSlug, erro };
          }
        });
        porConta.push(resultado);
      }

      const resumo = {
        dias,
        contas: porConta.length,
        pulados: porConta.filter((item) => item.erro).length,
        repasses: porConta.reduce((total, item) => total + (item.resumo?.repasses ?? 0), 0),
        atualizados: porConta.reduce((total, item) => total + (item.resumo?.atualizados ?? 0), 0),
        semPedido: porConta.reduce((total, item) => total + (item.resumo?.semPedido ?? 0), 0),
        porConta,
      };

      /* Todas as lojas falharem é problema sistêmico — credencial vencida,
         IP fora da lista, banco. Uma só não derruba a volta. */
      if (resumo.pulados > 0 && resumo.pulados === porConta.length) {
        throw new Error(`A37 incompleta: todas as ${porConta.length} loja(s) falharam. Conferir por conta.`);
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return resumo;
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
