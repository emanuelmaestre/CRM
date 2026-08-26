import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, eventoDominio, produto, produtoCanal } from "@/shared/lib/db/schema";
import { cliente, clienteIdentidade } from "@/shared/lib/db/schema/clientes";
import { pedido, pedidoItem } from "@/shared/lib/db/schema/vendas";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";

/* Dois bugs que só apareciam contra o banco de verdade, os dois derrubando a
   sincronização inteira de Pedidos (Shopee e Mercado Livre) em 25/08/2026:

   1. `uq_cliente_org_telefone_active`: a mesma pessoa comprando em dois canais
      não tem `cliente_identidade` do segundo canal, então a ingestão tentava
      INSERT de um cliente novo com um telefone que já existia — violação de
      constraint, e nenhum pedido entrava.

   2. Match de SKU: o produto era procurado a partir de `produto_canal` filtrado
      pela conta do canal, então um produto da marca vinculado só ao Mercado
      Livre nunca era encontrado por um pedido da Shopee com o mesmo SKU
      interno — mesmo o vendedor usando o mesmo SKU nos dois marketplaces. */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste integrado de ingestão de pedidos.");
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID é obrigatória para o teste integrado de ingestão de pedidos.");

const sufixo = randomUUID().slice(0, 8);
let brandId: string;
let contaMercadoLivreId: string;
let contaShopeeId: string;
let produtoId: string;

const pedidosParaLimpar: string[] = [];
const clientesParaLimpar: string[] = [];

beforeAll(async () => {
  const [marca] = await db.insert(brand).values({
    orgId,
    name: `Teste ingestao ${sufixo}`,
    slug: `teste_ingestao_${sufixo}`,
  }).returning({ id: brand.id });
  brandId = marca.id;

  const [contaMl] = await db.insert(channelAccount).values({
    orgId,
    brandId,
    tipo: "mercadolivre",
    nome: `ML teste ${sufixo}`,
    status: "conectado",
    vaultKey: `teste:ml:${sufixo}`,
  }).returning({ id: channelAccount.id });
  contaMercadoLivreId = contaMl.id;

  const [contaShopee] = await db.insert(channelAccount).values({
    orgId,
    brandId,
    tipo: "shopee",
    nome: `Shopee teste ${sufixo}`,
    status: "conectado",
    vaultKey: `teste:shopee:${sufixo}`,
  }).returning({ id: channelAccount.id });
  contaShopeeId = contaShopee.id;

  // Produto da marca vinculado SÓ ao Mercado Livre — é o cenário do bug 2.
  const [prod] = await db.insert(produto).values({
    orgId,
    brandId,
    sku: `SKU_COMPARTILHADO_${sufixo}`,
    nome: `Produto teste ${sufixo}`,
    preco: "10.00",
  }).returning({ id: produto.id });
  produtoId = prod.id;

  await db.insert(produtoCanal).values({
    orgId,
    produtoId,
    channelAccountId: contaMercadoLivreId,
    externalListingId: `MLB-${sufixo}`,
    externalSkuId: `SKU_COMPARTILHADO_${sufixo}`,
    ativo: true,
  });
});

// Escreve no banco real, então a limpeza não pode depender de o setup ter ido
// até o fim: se o beforeAll falhar no meio, os ids seguintes ficam undefined e
// um delete com parâmetro undefined explode, escondendo o erro original e
// deixando as linhas já criadas para trás.
afterAll(async () => {
  const limpar = async (tarefa: () => Promise<unknown>) => {
    try { await tarefa(); } catch (error) { console.warn("[limpeza]", error); }
  };
  for (const id of pedidosParaLimpar) {
    if (!id) continue;
    await limpar(() => db.delete(pedidoItem).where(eq(pedidoItem.pedidoId, id)));
    await limpar(() => db.delete(pedido).where(eq(pedido.id, id)));
  }
  for (const id of new Set(clientesParaLimpar)) {
    if (!id) continue;
    await limpar(() => db.delete(clienteIdentidade).where(eq(clienteIdentidade.clienteId, id)));
    await limpar(() => db.delete(cliente).where(eq(cliente.id, id)));
  }
  if (produtoId) {
    await limpar(() => db.delete(produtoCanal).where(eq(produtoCanal.produtoId, produtoId)));
    await limpar(() => db.delete(produto).where(eq(produto.id, produtoId)));
  }
  // A ingestão publica eventos de domínio referenciando a marca — sem apagar
  // antes, o delete da marca esbarra na FK de evento_dominio.
  if (brandId) {
    await limpar(() => db.delete(eventoDominio).where(eq(eventoDominio.brandId, brandId)));
  }
  for (const id of [contaShopeeId, contaMercadoLivreId]) {
    if (!id) continue;
    await limpar(() => db.delete(channelAccount).where(eq(channelAccount.id, id)));
  }
  if (brandId) {
    await limpar(() => db.delete(brand).where(eq(brand.id, brandId)));
  }
});

// Banco real: cada ingestão faz várias idas e voltas e ainda publica eventos.
describe.sequential("ingestão de pedidos — colisão de cliente e match de SKU", { timeout: 60_000 }, () => {
  it("reaproveita o cliente quando outro canal já cadastrou o mesmo telefone", async () => {
    const telefone = `+5511${Date.now().toString().slice(-9)}`;
    const skuCompartilhado = `SKU_COMPARTILHADO_${sufixo}`;

    const primeiro = await ingerirPedido(orgId, brandId, contaMercadoLivreId, {
      providerOrderId: `ML-${sufixo}-1`,
      canal: "mercadolivre",
      clienteExternalId: `ml-buyer-${sufixo}`,
      clienteNome: "Comprador Teste",
      clienteTelefone: telefone,
      status: "paid",
      total: "10.00",
      itens: [{ skuExterno: skuCompartilhado, quantidade: 1, precoUnitario: "10.00" }],
      criadoEm: new Date(),
    });
    pedidosParaLimpar.push(primeiro.pedidoId);
    expect(primeiro.novo).toBe(true);

    // Mesma pessoa, mesmo telefone, canal diferente: antes do fix o INSERT de
    // cliente violava uq_cliente_org_telefone_active e derrubava a leva toda.
    const segundo = await ingerirPedido(orgId, brandId, contaShopeeId, {
      providerOrderId: `SHP-${sufixo}-1`,
      canal: "shopee",
      clienteExternalId: `shopee-buyer-${sufixo}`,
      clienteNome: "Comprador Teste",
      clienteTelefone: telefone,
      status: "READY_TO_SHIP",
      total: "10.00",
      itens: [{ skuExterno: skuCompartilhado, quantidade: 1, precoUnitario: "10.00" }],
      criadoEm: new Date(),
    });
    pedidosParaLimpar.push(segundo.pedidoId);
    expect(segundo.novo).toBe(true);

    // Um único cliente com aquele telefone, com as duas identidades penduradas.
    const clientes = await db.select({ id: cliente.id }).from(cliente)
      .where(and(eq(cliente.orgId, orgId), eq(cliente.telefone, telefone)));
    expect(clientes).toHaveLength(1);
    clientesParaLimpar.push(clientes[0].id);

    const identidades = await db.select({ canal: clienteIdentidade.canal })
      .from(clienteIdentidade)
      .where(eq(clienteIdentidade.clienteId, clientes[0].id));
    expect(identidades.map((i) => i.canal).sort()).toEqual(["mercadolivre", "shopee"]);
  });

  it("casa o SKU do pedido com produto da marca vinculado a outro canal", async () => {
    // O produto só tem produto_canal do Mercado Livre; o pedido vem da Shopee
    // com o mesmo SKU interno. Antes do fix: "SKUs sem produto na marca".
    const resultado = await ingerirPedido(orgId, brandId, contaShopeeId, {
      providerOrderId: `SHP-${sufixo}-2`,
      canal: "shopee",
      clienteExternalId: `shopee-buyer-2-${sufixo}`,
      clienteNome: "Outro Comprador",
      status: "READY_TO_SHIP",
      total: "10.00",
      itens: [{ skuExterno: `SKU_COMPARTILHADO_${sufixo}`, quantidade: 1, precoUnitario: "10.00" }],
      criadoEm: new Date(),
    });
    pedidosParaLimpar.push(resultado.pedidoId);
    expect(resultado.novo).toBe(true);

    const itens = await db.select({ produtoId: pedidoItem.produtoId })
      .from(pedidoItem)
      .where(eq(pedidoItem.pedidoId, resultado.pedidoId));
    expect(itens).toHaveLength(1);
    expect(itens[0].produtoId).toBe(produtoId);

    const [identidade] = await db.select({ clienteId: clienteIdentidade.clienteId })
      .from(clienteIdentidade)
      .where(and(
        eq(clienteIdentidade.orgId, orgId),
        eq(clienteIdentidade.externalId, `shopee-buyer-2-${sufixo}`),
      ));
    if (identidade) clientesParaLimpar.push(identidade.clienteId);
  });

  it("enriquece o financeiro quando a Shopee libera o escrow depois do primeiro webhook", async () => {
    const providerOrderId = `SHP-${sufixo}-FINANCEIRO`;
    const clienteExternalId = `shopee-financeiro-${sufixo}`;
    const base = {
      providerOrderId,
      canal: "shopee",
      clienteExternalId,
      clienteNome: "Comprador Financeiro",
      status: "READY_TO_SHIP",
      total: "50.10",
      itens: [{
        skuExterno: `SKU_COMPARTILHADO_${sufixo}`,
        quantidade: 1,
        precoUnitario: "45.90",
      }],
      criadoEm: new Date(),
    };
    const primeiro = await ingerirPedido(orgId, brandId, contaShopeeId, base);
    pedidosParaLimpar.push(primeiro.pedidoId);

    const repetido = await ingerirPedido(orgId, brandId, contaShopeeId, {
      ...base,
      frete: "4.20",
      desconto: "1.00",
      acrescimo: "0.25",
      valorLiquido: "41.50",
      itens: [{ ...base.itens[0], taxaMarketplace: "4.40" }],
    });
    expect(repetido.novo).toBe(false);

    const [financeiro] = await db
      .select({
        frete: pedido.frete,
        desconto: pedido.desconto,
        acrescimo: pedido.acrescimo,
        valorLiquido: pedido.valorLiquido,
        taxaMarketplace: pedidoItem.taxaMarketplace,
      })
      .from(pedido)
      .innerJoin(pedidoItem, eq(pedidoItem.pedidoId, pedido.id))
      .where(eq(pedido.id, primeiro.pedidoId));
    expect(financeiro).toMatchObject({
      frete: "4.20",
      desconto: "1.00",
      acrescimo: "0.25",
      valorLiquido: "41.50",
      taxaMarketplace: "4.40",
    });

    const [identidade] = await db.select({ clienteId: clienteIdentidade.clienteId })
      .from(clienteIdentidade)
      .where(and(eq(clienteIdentidade.orgId, orgId), eq(clienteIdentidade.externalId, clienteExternalId)));
    if (identidade) clientesParaLimpar.push(identidade.clienteId);
  });
});
