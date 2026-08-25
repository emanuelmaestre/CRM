import { and, eq } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import {
  limparAvaliacoesForaDoCatalogoMercadoLivre,
  sincronizarAvaliacoesShopeeConta,
  sincronizarPaginaAvaliacoesMercadoLivre,
} from "@/modules/canais/application/avaliacoes.service";
import { finalizarJob, iniciarJob } from "./job-monitor";

/** Atualiza avaliações sem concentrar centenas de chamadas em um único step.
 * Cada página do Mercado Livre fica memoizada pelo Inngest: se uma execução
 * for retomada, as páginas prontas não são baixadas novamente. A Shopee usa
 * poucas chamadas em lote/cursor e roda uma vez por conta. */
export const A28_syncAvaliacoesML = inngest.createFunction(
  {
    id: "A28-sync-avaliacoes-ml",
    name: "A28 — Sincronização de avaliações dos marketplaces",
    concurrency: { limit: 1 },
    // Avaliação não precisa reler centenas de anúncios a cada hora. Quatro
    // rodadas diárias mantêm o dado recente e reduzem 75% da carga anterior.
    triggers: [{ cron: "17 */6 * * *" }],
  },
  async ({ step, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({
      orgId,
      nome: "A28-sync-avaliacoes-ml",
      tentativa: attempt,
    }));

    try {
      const contas = await step.run("listar-contas-avaliacoes", () =>
        db
          .select({ id: channelAccount.id, tipo: channelAccount.tipo })
          .from(channelAccount)
          .innerJoin(brand, and(
            eq(brand.id, channelAccount.brandId),
            eq(brand.orgId, channelAccount.orgId),
          ))
          .where(and(
            eq(channelAccount.orgId, orgId),
            eq(channelAccount.status, "conectado"),
            eq(brand.active, true),
          )),
      );

      let anunciosSincronizados = 0;
      let contasVerificadas = 0;
      for (const conta of contas) {
        if (conta.tipo === "shopee") {
          const resultado = await step.run(`avaliacoes-shopee-${conta.id}`, () =>
            sincronizarAvaliacoesShopeeConta(orgId, conta.id),
          );
          anunciosSincronizados += resultado.anunciosSincronizados;
          contasVerificadas += resultado.contasVerificadas;
          continue;
        }
        if (conta.tipo !== "mercadolivre") continue;

        const listingIds: string[] = [];
        let offset = 0;
        for (let pagina = 0; pagina < 200; pagina++) {
          const parcial = await step.run(`avaliacoes-ml-${conta.id}-${offset}`, () =>
            sincronizarPaginaAvaliacoesMercadoLivre(orgId, conta.id, offset),
          );
          listingIds.push(...parcial.listingIds);
          anunciosSincronizados += parcial.sincronizados;
          if (parcial.fim) break;
          offset = parcial.proximoOffset;
        }
        await step.run(`avaliacoes-ml-limpar-${conta.id}`, () =>
          limparAvaliacoesForaDoCatalogoMercadoLivre(orgId, conta.id, listingIds),
        );
        contasVerificadas += 1;
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return { orgId, contasVerificadas, anunciosSincronizados };
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
