import { and, eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { ehErroSkuSemProduto } from "@/modules/canais/domain/errors";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { SHOPEE_PEDIDOS_LIBERADO } from "@/modules/canais/infrastructure/shopee.provider";
import { despacharEventosPendentes, emitirEventoUnico } from "@/shared/events";
import { inngest } from "@/shared/lib/inngest/client";
import { finalizarJob, iniciarJob } from "./job-monitor";

/* Intervalo do cron e janela de busca andam juntos: a cada volta o job pede os
   pedidos da janela, então uma janela menor que o intervalo abre um buraco por
   onde pedidos somem para sempre. Ficavam separados (cron de 4 em 4 minutos,
   janela de 10 minutos) e era fácil mexer num sem o outro — por isso a janela
   agora é derivada do intervalo, com folga deliberada de sobreposição.

   A sobreposição não duplica nada: a ingestão é idempotente por
   providerOrderId (ver ingerirPedido), então reprocessar o mesmo pedido é uma
   consulta a mais e nenhum registro a mais.

   Três horas, e não minutos, porque este job é CONTINGÊNCIA: o caminho normal
   de um pedido novo é o webhook do canal (api/webhooks/*), que chega na hora.
   O polling existe para cobrir webhook perdido, e a cada 4 minutos custava
   ~720 chamadas por dia no proxy de IP fixo — cota que é o gargalo real aqui —
   mesmo em dia sem nenhuma venda. */
const INTERVALO_POLL_HORAS = 3;
const JANELA_BUSCA_MS = (INTERVALO_POLL_HORAS + 1) * 60 * 60 * 1_000;

export const A24_pollPedidos = inngest.createFunction(
  {
    id: "A24-poll-pedidos",
    name: `A24 — Contingência de ingestão de pedidos (a cada ${INTERVALO_POLL_HORAS}h)`,
    concurrency: { limit: 1 },
    /* Sem repetição automática. O `throw` abaixo só acontece quando NENHUMA
       conta respondeu, e isso é causa sistêmica por definição — credencial
       vencida, proxy fora, canal fora do ar. As 4 tentativas padrão do
       Inngest não consertam nada disso: refazem o polling de todas as contas
       em minutos e queimam a cota do proxy de IP fixo, que é o gargalo real
       aqui. O erro continua sendo lançado, então o painel do Inngest e o
       monitor de jobs seguem sinalizando a falha; quem repete o trabalho é o
       cron, e a janela de busca (INTERVALO + 1h) cobre a volta perdida. */
    retries: 0,
    triggers: [{ cron: `0 */${INTERVALO_POLL_HORAS} * * *` }],
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

      const desde = new Date(Date.now() - JANELA_BUSCA_MS);
      const resultados: Array<{ contaId: string; encontrados: number; novos: number; ignorados?: number; erro?: string }> = [];

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
          let ignorados = 0;
          let falhasSemCausaConhecida = 0;
          for (const pedido of pedidos) {
            const pedidoNormalizado = { ...pedido, criadoEm: new Date(pedido.criadoEm) };
            // Mesma regra do A31: um pedido ruim é problema daquele pedido, não
            // da conta — anúncio removido depois da venda (ErroSkuSemProduto),
            // comprador colidindo com cadastro existente, dado torto do canal.
            // Sem isso, uma única venda antiga travava a volta inteira a cada
            // quatro minutos, pra sempre, e nenhum pedido bom entrava.
            const resultado = await step.run(`ingerir-${conta.id}-${pedido.providerOrderId}`, async () => {
              try {
                return await ingerirPedido(conta.orgId, conta.brandId, conta.id, pedidoNormalizado);
              } catch (error) {
                const motivo = error instanceof Error ? error.message : String(error);
                console.warn(
                  `[A24] pedido ${pedido.providerOrderId} (${conta.tipo}/${conta.brandSlug}) pulado: ${motivo}`,
                );
                // Mesma distinção do A31: causa conhecida daquele pedido
                // (SKU sem produto na marca) não conta pro freio sistêmico.
                return { pedidoId: "", novo: false, falhou: true, porPedido: ehErroSkuSemProduto(error) };
              }
            });
            if (resultado.novo) novos++;
            if ("falhou" in resultado && resultado.falhou) {
              ignorados++;
              if (!("porPedido" in resultado) || !resultado.porPedido) falhasSemCausaConhecida++;
            }
          }
          // Todos os pedidos falharem PODE ser problema sistêmico da conta —
          // cai no catch abaixo, que marca a conta como degradada. Mas numa
          // janela com um pedido só, "todos" é um pedido: um SKU sem produto
          // na marca degradava a conta a cada quatro minutos. O freio só vale
          // quando ao menos uma falha não tem causa conhecida de pedido.
          if (pedidos.length > 0 && ignorados === pedidos.length && falhasSemCausaConhecida > 0) {
            throw new Error(`Nenhum dos ${pedidos.length} pedido(s) pôde ser importado — ver logs [A24].`);
          }
          resultados.push({ contaId: conta.id, encontrados: pedidos.length, novos, ignorados });
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
