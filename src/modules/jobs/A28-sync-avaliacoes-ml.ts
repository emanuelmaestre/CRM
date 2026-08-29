import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, sincronizacaoExecucao } from "@/shared/lib/db/schema";
import {
  limparAvaliacoesForaDoCatalogoMercadoLivre,
  sincronizarAvaliacoesShopeeConta,
  sincronizarPaginaAvaliacoesMercadoLivre,
} from "@/modules/canais/application/avaliacoes.service";
import { finalizarJob, iniciarJob } from "./job-monitor";
import { obterReputacao } from "@/modules/metricas/application/reputacao.service";
import { criarShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug } from "@/shared/config/brands";
import { inicioMinimoExecucaoViva } from "@/modules/canais/domain/sincronizacao-progresso";
import type { CrudContext } from "@/shared/lib/crud-factory";

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
          .select({ id: channelAccount.id, tipo: channelAccount.tipo, brandSlug: brand.slug })
          .from(channelAccount)
          .innerJoin(brand, and(
            eq(brand.id, channelAccount.brandId),
            eq(brand.orgId, channelAccount.orgId),
          ))
          .where(and(
            eq(channelAccount.orgId, orgId),
            eq(channelAccount.status, "conectado"),
            inArray(channelAccount.tipo, ["mercadolivre", "shopee"]),
            eq(brand.active, true),
          )),
      );

      let anunciosSincronizados = 0;
      let contasVerificadas = 0;
      const ctx: CrudContext = { orgId, perfil: "admin", db };
      for (const conta of contas) {
        /* Uma sincronização manual VIVA ganha prioridade: o cron não duplica
           as mesmas chamadas (principalmente Shopee/Webshare) para essa conta.
           "Viva" precisa da idade, não só de `finalizado_em` nulo — execução
           que morreu no meio fica aberta para sempre e, sem esta régua, tirava
           a conta de todas as voltas seguintes em silêncio. É a mesma regra que
           `dispararSincronizacaoConta` já aplicava no caminho manual, e a razão
           de "clicar em Sincronizar" resolver: o clique encerrava a linha
           morta que o cron continuava respeitando. */
        const execucaoId = await step.run(`progresso-iniciar-${conta.id}`, async () => {
          const ativa = await db.select({ id: sincronizacaoExecucao.id })
            .from(sincronizacaoExecucao)
            .where(and(
              eq(sincronizacaoExecucao.orgId, orgId),
              eq(sincronizacaoExecucao.channelAccountId, conta.id),
              isNull(sincronizacaoExecucao.finalizadoEm),
              gt(sincronizacaoExecucao.iniciadoEm, inicioMinimoExecucaoViva()),
            ))
            .limit(1)
            .then((linhas) => linhas[0]);
          if (ativa) return null;
          return db.insert(sincronizacaoExecucao).values({
            orgId,
            channelAccountId: conta.id,
            catalogoStatus: "concluido",
            catalogoResultado: { omitido: true, progresso: 100 },
            pedidosStatus: "concluido",
            pedidosResultado: { omitido: true, progresso: 100 },
            anunciosStatus: "concluido",
            anunciosResultado: { omitido: true, progresso: 100 },
            reclamacoesStatus: "concluido",
            reclamacoesResultado: { desativado: true },
            mensagensStatus: "concluido",
            mensagensResultado: { desativado: true },
          }).returning({ id: sincronizacaoExecucao.id }).then((linhas) => linhas[0].id);
        });
        if (!execucaoId) continue;

        const atualizar = (patch: Partial<typeof sincronizacaoExecucao.$inferInsert>) =>
          db.update(sincronizacaoExecucao).set(patch).where(eq(sincronizacaoExecucao.id, execucaoId));

        try {
          await step.run(`progresso-avaliacoes-${conta.id}`, () => atualizar({
            avaliacoesStatus: "em_andamento", avaliacoesResultado: { progresso: 1 },
          }));
          if (conta.tipo === "shopee") {
            const resultado = await step.run(`avaliacoes-shopee-${conta.id}`, () =>
              sincronizarAvaliacoesShopeeConta(orgId, conta.id),
            );
            anunciosSincronizados += resultado.anunciosSincronizados;
            contasVerificadas += resultado.contasVerificadas;
          } else if (conta.tipo === "mercadolivre") {
            const listingIds: string[] = [];
            let offset = 0;
            let totalConta = 0;
            for (let pagina = 0; pagina < 200; pagina++) {
              const parcial = await step.run(`avaliacoes-ml-${conta.id}-${offset}`, () =>
                sincronizarPaginaAvaliacoesMercadoLivre(orgId, conta.id, offset),
              );
              listingIds.push(...parcial.listingIds);
              totalConta += parcial.sincronizados;
              anunciosSincronizados += parcial.sincronizados;
              await step.run(`progresso-avaliacoes-${conta.id}-${offset}`, () => atualizar({
                avaliacoesResultado: {
                  progresso: parcial.fim ? 95 : Math.min(90, 10 + (pagina + 1) * 4),
                  processados: totalConta,
                },
              }));
              if (parcial.fim) break;
              offset = parcial.proximoOffset;
            }
            await step.run(`avaliacoes-ml-limpar-${conta.id}`, () =>
              limparAvaliacoesForaDoCatalogoMercadoLivre(orgId, conta.id, listingIds),
            );
            contasVerificadas += 1;
          }
          await step.run(`progresso-avaliacoes-fim-${conta.id}`, () => atualizar({
            avaliacoesStatus: "concluido",
            avaliacoesResultado: { progresso: 100 },
          }));
        } catch (error) {
          await step.run(`progresso-avaliacoes-erro-${conta.id}`, () => atualizar({
            avaliacoesStatus: "erro",
            avaliacoesErro: error instanceof Error ? error.message : String(error),
          }));
        }

        // A reputação entra na mesma coleta de seis horas e fica persistida;
        // Métricas apenas lê esta fotografia local.
        try {
          await step.run(`progresso-reputacao-${conta.id}`, () => atualizar({
            reputacaoStatus: "em_andamento", reputacaoResultado: { progresso: 10 },
          }));
          let resultado: Record<string, unknown>;
          if (conta.tipo === "mercadolivre") {
            const reputacao = await step.run(`reputacao-ml-${conta.id}`, () =>
              obterReputacao(ctx, { channelAccountId: conta.id, ignorarCache: true }),
            );
            resultado = { reputacao: reputacao.marcas[0] ?? null, marcasComFalha: reputacao.marcasComFalha };
          } else if (conta.tipo === "shopee" && isBrandSlug(conta.brandSlug)) {
            const desempenho = await step.run(`reputacao-shopee-${conta.id}`, async () =>
              (await criarShopeeProvider(conta.brandSlug as Parameters<typeof criarShopeeProvider>[0])).obterDesempenhoLoja(),
            );
            resultado = { rating: desempenho.rating, metricas: desempenho.metricas };
          } else {
            resultado = { semSuporte: true };
          }
          await step.run(`progresso-reputacao-fim-${conta.id}`, () => atualizar({
            reputacaoStatus: "concluido", reputacaoResultado: { ...resultado, progresso: 100 },
          }));
        } catch (error) {
          await step.run(`progresso-reputacao-erro-${conta.id}`, () => atualizar({
            reputacaoStatus: "erro",
            reputacaoErro: error instanceof Error ? error.message : String(error),
          }));
        }

        await step.run(`progresso-finalizar-${conta.id}`, () => atualizar({ finalizadoEm: new Date() }));
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return { orgId, contasVerificadas, anunciosSincronizados };
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
