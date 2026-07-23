import { and, eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { despacharEventosPendentes, emitirEvento } from "@/shared/events";
import { inngest } from "@/shared/lib/inngest/client";
import { finalizarJob, iniciarJob } from "./job-monitor";

export const A24_pollPedidos = inngest.createFunction(
  {
    id: "A24-poll-pedidos",
    name: "A24 — Contingência de ingestão de pedidos (SLA 5 min)",
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/4 * * * *" }],
  },
  async ({ step, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({
      orgId,
      nome: "A24-poll-pedidos",
      tentativa: attempt,
    }));

    try {
      const outbox = await step.run("recuperar-eventos-pendentes", () =>
        despacharEventosPendentes(orgId),
      );
      if (outbox.falhas > 0) {
        throw new Error(`Falha ao publicar ${outbox.falhas} evento(s) pendente(s) no Inngest.`);
      }

      const contas = await step.run("buscar-contas-conectadas", () =>
        db
          .select({
            id: channelAccount.id,
            orgId: channelAccount.orgId,
            brandId: channelAccount.brandId,
            tipo: channelAccount.tipo,
            brandSlug: brand.slug,
          })
          .from(channelAccount)
          .innerJoin(brand, and(
            eq(brand.id, channelAccount.brandId),
            eq(brand.orgId, channelAccount.orgId),
          ))
          .where(and(
            eq(channelAccount.orgId, orgId),
            eq(channelAccount.status, "conectado"),
          )),
      );

      const desde = new Date(Date.now() - 10 * 60 * 1_000);
      const resultados: Array<{ contaId: string; encontrados: number; novos: number; erro?: string }> = [];

      for (const conta of contas) {
        try {
          const provider = await resolverChannelProvider(conta.tipo, conta.brandSlug);
          if (!provider) continue;
          const pedidos = await step.run(`buscar-${conta.id}`, () => provider.buscarPedidos(desde));
          let novos = 0;
          for (const pedido of pedidos) {
            const pedidoNormalizado = { ...pedido, criadoEm: new Date(pedido.criadoEm) };
            const resultado = await step.run(`ingerir-${conta.id}-${pedido.providerOrderId}`, () =>
              ingerirPedido(conta.orgId, conta.brandId, conta.id, pedidoNormalizado),
            );
            if (resultado.novo) novos++;
          }
          resultados.push({ contaId: conta.id, encontrados: pedidos.length, novos });
        } catch (error) {
          resultados.push({ contaId: conta.id, encontrados: 0, novos: 0, erro: String(error) });
          await emitirEvento({
            tipo: "canal.degradado",
            orgId: conta.orgId,
            brandId: conta.brandId,
            entidade: "channel_account",
            entidadeId: conta.id,
            payload: { motivo: "falha-poll-pedidos", erro: String(error) },
          });
        }
      }

      const resumo = {
        outbox,
        contas: resultados.length,
        encontrados: resultados.reduce((total, item) => total + item.encontrados, 0),
        novos: resultados.reduce((total, item) => total + item.novos, 0),
        falhas: resultados.filter((item) => item.erro).length,
        resultados,
      };
      if (contas.length === 0) {
        throw new Error("A24 sem contas de marketplace conectadas para o polling de contingência.");
      }
      if (resumo.falhas > 0) {
        throw new Error(`A24 falhou em ${resumo.falhas} de ${resumo.contas} conta(s) conectada(s).`);
      }
      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return resumo;
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
