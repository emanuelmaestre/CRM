import { and, eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import { ErroSkuSemProduto, ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { SHOPEE_PEDIDOS_LIBERADO } from "@/modules/canais/infrastructure/shopee.provider";
import { despacharEventosPendentes, emitirEventoUnico } from "@/shared/events";
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
        // App Shopee aprovado (Product Management) não tem permissão pra API
        // de Pedidos — sem esse freio, essa conta falhava a cada 4 minutos,
        // gastando cota do proxy de IP fixo à toa. Reverter junto com
        // SHOPEE_PEDIDOS_LIBERADO em shopee.provider.ts.
        if (conta.tipo === "shopee" && !SHOPEE_PEDIDOS_LIBERADO) {
          resultados.push({ contaId: conta.id, encontrados: 0, novos: 0 });
          continue;
        }
        try {
          const provider = await resolverChannelProvider(conta.tipo, conta.brandSlug);
          if (!provider) {
            throw new Error(`Provider ${conta.tipo}/${conta.brandSlug} não suportado.`);
          }
          const pedidos = await step.run(`buscar-${conta.id}`, () => provider.buscarPedidos(desde));
          let novos = 0;
          for (const pedido of pedidos) {
            const pedidoNormalizado = { ...pedido, criadoEm: new Date(pedido.criadoEm) };
            // Mesma regra do A31: SKU sem produto na marca é problema daquele
            // pedido (anúncio removido depois da venda), não da conta — pular
            // e seguir, senão uma venda antiga trava a volta inteira a cada
            // quatro minutos, pra sempre. Ver ErroSkuSemProduto.
            const resultado = await step.run(`ingerir-${conta.id}-${pedido.providerOrderId}`, async () => {
              try {
                return await ingerirPedido(conta.orgId, conta.brandId, conta.id, pedidoNormalizado);
              } catch (error) {
                if (!(error instanceof ErroSkuSemProduto)) throw error;
                console.warn(`[A24] pedido ${pedido.providerOrderId} pulado: ${error.message}`);
                return { pedidoId: "", novo: false };
              }
            });
            if (resultado.novo) novos++;
          }
          resultados.push({ contaId: conta.id, encontrados: pedidos.length, novos });
        } catch (error) {
          resultados.push({ contaId: conta.id, encontrados: 0, novos: 0, erro: String(error) });
          // Uma vez por hora por conta, não uma vez por execução do cron.
          await emitirEventoUnico({
            tipo: "canal.degradado",
            orgId: conta.orgId,
            brandId: conta.brandId,
            entidade: "channel_account",
            entidadeId: conta.id,
            payload: {
              motivo: "falha-poll-pedidos",
              tipo: conta.tipo,
              erro: String(error),
              ultimoErro: String(error),
            },
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
        throw new Error("A24 sem contas de canais de venda conectadas para a consulta de contingência.");
      }
      // Mesma regra do A5: falha isolada não derruba a volta inteira. Uma conta
      // instável fazia o job todo ser repetido pelo Inngest — e como cada
      // tentativa refaz o polling das contas saudáveis, a carga se multiplicava
      // justamente quando o canal já estava lento. Em 20/08 eram 1.765 falhas
      // em 6.527 execuções, com média de 359s por falha e picos de ~17 min.
      // A conta problemática já ficou registrada em `resultados` e no evento
      // canal.degradado; a ingestão é idempotente, então o que ela deixou de
      // trazer entra na próxima volta, quatro minutos depois.
      if (resumo.falhas > 0 && resumo.falhas === resumo.contas) {
        throw new Error(
          `A24 falhou em todas as ${resumo.contas} conta(s) conectada(s) — verifique credenciais e disponibilidade do canal.`,
        );
      }
      if (resumo.falhas > 0) {
        // O Inngest recebe sucesso (não repete as contas saudáveis), mas o
        // monitor operacional preserva que a rodada terminou com falha
        // parcial. finalizarJob não lança; apenas registra status/erro.
        await step.run("registrar-falha-parcial", () => finalizarJob(
          jobId,
          new Error(`A24 concluiu parcialmente: ${resumo.falhas} de ${resumo.contas} conta(s) falharam.`),
        ));
        return resumo;
      }
      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return resumo;
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
