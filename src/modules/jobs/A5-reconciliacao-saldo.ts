import { and, eq, sql } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, estoqueCanalSaldo, produtoCanal } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";

/** Quantos mapeamentos cada passo do Inngest processa de uma vez.
 *
 *  O tamanho vem do custo de um passo: cada `step.run` é uma ida e volta HTTP
 *  própria, então um passo por anúncio transformava uma coleta de segundos em
 *  dezenas de horas. Em lotes, o número de passos cai de ~550 para ~11, e cada
 *  lote ainda cabe folgado no tempo limite de execução. */
const TAMANHO_DO_LOTE = 50;

export const A5_coletaSaldoCanais = inngest.createFunction(
  {
    id: "A5-reconciliacao-saldo",
    name: "A5 — Coleta de saldo de estoque por canal",
    concurrency: { limit: 1 },
    // De hora em hora, e não uma vez por dia: a operação vende o dia inteiro,
    // e uma varredura completa custa ~20s e ~550 chamadas — perto de 3% do teto
    // horário da aplicação no Mercado Livre. O alerta de mínimo passa a ter, no
    // pior caso, uma hora de atraso em vez de um dia.
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const mapeamentos = await step.run("buscar-mapeamentos", () =>
      db
        .select({
          produtoCanalId: produtoCanal.id,
          produtoId: produtoCanal.produtoId,
          externalListingId: produtoCanal.externalListingId,
          externalSkuId: produtoCanal.externalSkuId,
          externalWarehouseId: produtoCanal.externalWarehouseId,
          channelAccountId: channelAccount.id,
          tipo: channelAccount.tipo,
          status: channelAccount.status,
          brandId: channelAccount.brandId,
          brandSlug: brand.slug,
        })
        .from(produtoCanal)
        .innerJoin(channelAccount, and(
          eq(channelAccount.id, produtoCanal.channelAccountId),
          eq(channelAccount.orgId, produtoCanal.orgId),
        ))
        .innerJoin(brand, and(
          eq(brand.id, channelAccount.brandId),
          eq(brand.orgId, channelAccount.orgId),
        ))
        .where(and(
          eq(produtoCanal.orgId, orgId),
          eq(produtoCanal.ativo, true),
        )),
    );

    const conectados = mapeamentos.filter((item) => item.status === "conectado");
    const desconectados = mapeamentos.length - conectados.length;

    const lotes: (typeof conectados)[] = [];
    for (let i = 0; i < conectados.length; i += TAMANHO_DO_LOTE) {
      lotes.push(conectados.slice(i, i + TAMANHO_DO_LOTE));
    }

    let coletados = 0;
    const falhas: Array<{ listingId: string; erro: string }> = [];

    for (const [indice, lote] of lotes.entries()) {
      const resultado = await step.run(`coletar-lote-${indice}`, async () => {
        // Em paralelo dentro do lote: o provider do Mercado Livre já limita as
        // chamadas simultâneas e faz backoff pelo Retry-After, então não há
        // risco de estourar o teto disparando o lote de uma vez.
        const saldos = await Promise.all(lote.map(async (item) => {
          try {
            const provider = await resolverChannelProvider(item.tipo, item.brandSlug);
            if (!provider) throw new Error(`Provider ${item.tipo}/${item.brandSlug} não suportado.`);
            const saldo = await provider.consultarEstoque({
              listingId: item.externalListingId,
              skuId: item.externalSkuId,
              warehouseId: item.externalWarehouseId,
            });
            return { item, saldo, erro: null as string | null };
          } catch (error) {
            return { item, saldo: null, erro: String(error) };
          }
        }));

        const linhas = saldos
          .filter((linha): linha is typeof linha & { saldo: number } => linha.saldo !== null)
          .map((linha) => ({
            orgId,
            produtoId: linha.item.produtoId,
            channelAccountId: linha.item.channelAccountId,
            produtoCanalId: linha.item.produtoCanalId,
            saldo: linha.saldo,
            verificadoEm: new Date(),
          }));

        // Uma escrita por lote em vez de uma por anúncio: mesma economia de
        // ida e volta que motivou o lote na chamada ao canal.
        if (linhas.length > 0) {
          await db
            .insert(estoqueCanalSaldo)
            .values(linhas)
            .onConflictDoUpdate({
              target: estoqueCanalSaldo.produtoCanalId,
              set: {
                saldo: sql`excluded.saldo`,
                verificadoEm: sql`excluded.verificado_em`,
              },
            });
        }

        return {
          gravados: linhas.length,
          falhas: saldos
            .filter((linha) => linha.erro)
            .map((linha) => ({ listingId: linha.item.externalListingId, erro: linha.erro as string })),
        };
      });

      coletados += resultado.gravados;
      falhas.push(...resultado.falhas);
    }

    // Falha isolada não derruba a coleta. Um anúncio com dado inconsistente do
    // lado do canal é permanente: se ele fizesse o job falhar, a execução seria
    // repetida sem parar e a coleta nunca fecharia uma volta. Só é tratado como
    // erro quando nada foi coletado, o que aponta para causa sistêmica —
    // credencial vencida, canal fora do ar.
    if (falhas.length > 0) {
      await emitirEvento({
        tipo: "canal.degradado",
        orgId,
        entidade: "channel_account",
        entidadeId: conectados[0]?.channelAccountId ?? orgId,
        payload: {
          motivo: "falha-coleta-estoque",
          totalFalhas: falhas.length,
          exemplos: falhas.slice(0, 10),
        },
      });
    }

    if (coletados === 0 && conectados.length > 0) {
      throw new Error(`A5 não coletou nenhum dos ${conectados.length} mapeamento(s) — verifique credenciais e disponibilidade do canal.`);
    }

    return {
      coletados,
      falhas: falhas.length,
      desconectados,
      lotes: lotes.length,
    };
  },
);
