import { and, eq } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { auditLog, brand, channelAccount, produto, produtoCanal, estoqueCanalSaldo } from "@/shared/lib/db/schema";
import { persistirEvento, despacharEvento } from "@/shared/events";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { isBrandSlug } from "@/shared/config/brands";

/** Cadastro manual de produto, um a um, não dá conta de um catálogo com
 *  centenas de anúncios — por isso o módulo de Estoque fica vazio pra quem
 *  já vende no Mercado Livre. Essa importação lê os anúncios ativos de cada
 *  conta conectada e cria o produto + o vínculo produto_canal automático
 *  pra quem ainda não tem: o saldo inicial vem do "available_quantity" do
 *  próprio anúncio, e a partir daí a baixa automática (A2) assume. Anúncio
 *  já mapeado não é tocado — evita sobrescrever ajuste manual. */
export async function importarCatalogoMercadoLivre(ctx: CrudContext): Promise<{
  contasVerificadas: number;
  produtosCriados: number;
  ignorados: number;
}> {
  assertPerfil(ctx, ["admin", "gestor"]);

  const contas = await ctx.db
    .select({
      channelAccountId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.tipo, "mercadolivre"),
      eq(channelAccount.status, "conectado"),
    ));

  let produtosCriados = 0;
  let ignorados = 0;

  for (const conta of contas) {
    if (!isBrandSlug(conta.brandSlug)) continue;
    try {
      const provider = await criarMLProvider(conta.brandSlug);
      let offset = 0;
      let total = 1;
      while (offset < total) {
        const pagina = await provider.listarAnunciosAtivos({ offset, limit: 50 });
        for (const item of pagina.items) {
          const jaMapeado = await ctx.db
            .select({ id: produtoCanal.id })
            .from(produtoCanal)
            .where(and(
              eq(produtoCanal.orgId, ctx.orgId),
              eq(produtoCanal.channelAccountId, conta.channelAccountId),
              eq(produtoCanal.externalListingId, item.listingId),
            ))
            .then((rows) => rows[0]);
          if (jaMapeado) { ignorados += 1; continue; }

          const sku = item.externalSku?.trim() || `ml-${item.listingId}${item.variationId ? `-${item.variationId}` : ""}`;

          try {
            await ctx.db.transaction(async (tx) => {
              const [criado] = await tx.insert(produto).values({
                orgId: ctx.orgId,
                brandId: conta.brandId,
                sku,
                nome: item.title,
                preco: item.price,
                estoqueMinimo: 0,
                ativo: true,
              }).returning();

              const [vinculo] = await tx.insert(produtoCanal).values({
                orgId: ctx.orgId,
                produtoId: criado.id,
                channelAccountId: conta.channelAccountId,
                externalListingId: item.listingId,
                externalSkuId: item.externalSku,
                externalWarehouseId: item.variationId,
                ativo: true,
              }).returning();

              // O anúncio já traz o saldo do canal — semeia aqui para o produto
              // não nascer zerado esperando a coleta noturna (A5).
              await tx.insert(estoqueCanalSaldo).values({
                orgId: ctx.orgId,
                produtoId: criado.id,
                channelAccountId: conta.channelAccountId,
                produtoCanalId: vinculo.id,
                saldo: item.availableQuantity,
              });

              await tx.insert(auditLog).values({
                orgId: ctx.orgId,
                brandId: conta.brandId,
                autorId: ctx.userId,
                autorTipo: ctx.userId ? "usuario" : "sistema",
                entidade: "produto",
                entidadeId: criado.id,
                acao: "create",
                depois: criado,
              });

              const evento = await persistirEvento({
                tipo: "produto.criado",
                orgId: ctx.orgId,
                brandId: conta.brandId,
                entidade: "produto",
                entidadeId: criado.id,
                payload: { sku: criado.sku, nome: criado.nome, origem: "importacao-mercadolivre" },
              }, tx);
              await despacharEvento(evento);
            });
            produtosCriados += 1;
          } catch (error) {
            // SKU duplicado (unique por org) é o caso esperado quando o
            // mesmo produto já existe sob outro anúncio/canal — segue o
            // catálogo em vez de abortar a importação inteira.
            console.error(`[estoque] falha ao importar anúncio ${item.listingId}`, error);
            ignorados += 1;
          }
        }
        total = pagina.totalListings;
        offset += pagina.limit;
        if (pagina.items.length === 0) break;
      }
    } catch (error) {
      console.error(`[estoque] importação de catálogo falhou para ${conta.brandSlug}`, error);
    }
  }

  return { contasVerificadas: contas.length, produtosCriados, ignorados };
}
