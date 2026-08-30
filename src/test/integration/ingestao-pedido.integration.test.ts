import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
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
/* ── Uma marca de teste, fixa, para sempre ────────────────────────────────
   `audit_log` é append-only por trigger (`prevent_audit_log_mutation`), e a
   ingestão escreve auditoria quando cria produto. Marca que já gerou uma
   linha dessas NUNCA pode ser apagada — a FK de audit_log segura o delete, e
   apagar a auditoria é justamente o que o banco proíbe.

   Com sufixo aleatório, cada execução deixava uma marca nova e inapagável no
   banco: em 30/08/2026 havia duas aparecendo na barra de filtros de /vendas,
   em produção. Slug fixo troca "uma marca por execução" por "uma marca, e
   só" — inativa, invisível na tela, reaproveitada na próxima volta. O sufixo
   continua isolando o resto (SKUs, números de pedido, compradores). */
const SLUG_MARCA_TESTE = "teste_ingestao";
let brandId: string;
let contaMercadoLivreId: string;
let contaShopeeId: string;
let produtoId: string;

const pedidosParaLimpar: string[] = [];
const clientesParaLimpar: string[] = [];
/** Produtos que a própria ingestão cria a partir do anúncio do pedido. */
const produtosParaLimpar: string[] = [];

beforeAll(async () => {
  /* Resíduo das execuções antigas, de quando cada uma criava a sua: some da
     barra de filtros de /vendas sem tentar um delete que o banco recusaria. */
  await db.update(brand)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(brand.orgId, orgId), like(brand.slug, "teste_ingestao_%")));

  const existente = await db
    .select({ id: brand.id })
    .from(brand)
    .where(and(eq(brand.orgId, orgId), eq(brand.slug, SLUG_MARCA_TESTE)))
    .then((linhas) => linhas[0]);

  if (existente) {
    brandId = existente.id;
  } else {
    const [marca] = await db.insert(brand).values({
      orgId,
      name: "Teste de ingestao (automatico)",
      slug: SLUG_MARCA_TESTE,
    }).returning({ id: brand.id });
    brandId = marca.id;
  }

  /* Inativa sempre: a marca existe para o teste, não para a operação, e é o
     que a mantém fora da barra de filtros. A ingestão não olha `active`. */
  await db.update(brand).set({ active: false, updatedAt: new Date() }).where(eq(brand.id, brandId));

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
  for (const id of new Set([...produtosParaLimpar, produtoId])) {
    if (!id) continue;
    await limpar(() => db.delete(produtoCanal).where(eq(produtoCanal.produtoId, id)));
    await limpar(() => db.delete(produto).where(eq(produto.id, id)));
  }
  // Eventos de domínio saem; auditoria NÃO — o banco recusa (append-only), e
  // insistir só enchia o stderr de erro esperado a cada execução.
  if (brandId) {
    await limpar(() => db.delete(eventoDominio).where(eq(eventoDominio.brandId, brandId)));
  }
  for (const id of [contaShopeeId, contaMercadoLivreId]) {
    if (!id) continue;
    await limpar(() => db.delete(channelAccount).where(eq(channelAccount.id, id)));
  }
  /* A marca fica, inativa e vazia, esperando a próxima execução: o rastro de
     auditoria que ela já gerou não pode ser apagado, então apagá-la nunca vai
     ser possível. O que importa é não deixar DADO para trás — pedido,
     cliente, produto e conta de canal saem todos acima. */
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

  /* O SKU do pedido é o que ele era no dia da compra; o do anúncio muda. Os
     três casos abaixo são os que deixaram 40 pedidos da WUWU parados (R$
     1.344,20, 03/06 a 04/08/2026). */
  it("casa pelo anúncio quando o SKU do pedido foi renomeado depois da venda", async () => {
    const resultado = await ingerirPedido(orgId, brandId, contaMercadoLivreId, {
      providerOrderId: `ML-${sufixo}-RENOMEADO`,
      canal: "mercadolivre",
      clienteExternalId: `ml-buyer-renomeado-${sufixo}`,
      clienteNome: "Comprador Anúncio Renomeado",
      status: "paid",
      total: "10.00",
      itens: [{
        // Este SKU não existe em produto nenhum da marca — só o anúncio é
        // conhecido, pelo vínculo criado no beforeAll.
        skuExterno: `SKU_ANTIGO_${sufixo}`,
        quantidade: 1,
        precoUnitario: "10.00",
        listingId: `MLB-${sufixo}`,
        titulo: "Título que não deve criar produto novo",
      }],
      criadoEm: new Date(),
    });
    pedidosParaLimpar.push(resultado.pedidoId);

    const itens = await db.select({ produtoId: pedidoItem.produtoId })
      .from(pedidoItem)
      .where(eq(pedidoItem.pedidoId, resultado.pedidoId));
    expect(itens[0].produtoId).toBe(produtoId);

    // Nenhum cadastro novo: o produto físico é o mesmo, só o SKU mudou.
    const duplicado = await db.select({ id: produto.id })
      .from(produto)
      .where(and(eq(produto.orgId, orgId), eq(produto.brandId, brandId), eq(produto.sku, `SKU_ANTIGO_${sufixo}`)));
    expect(duplicado).toHaveLength(0);

    const [identidade] = await db.select({ clienteId: clienteIdentidade.clienteId })
      .from(clienteIdentidade)
      .where(and(eq(clienteIdentidade.orgId, orgId), eq(clienteIdentidade.externalId, `ml-buyer-renomeado-${sufixo}`)));
    if (identidade) clientesParaLimpar.push(identidade.clienteId);
  });

  it("cria o produto pelo anúncio do pedido quando o catálogo não conhece o anúncio", async () => {
    // Anúncio pausado ou excluído: a importação de catálogo não o enxerga, e
    // sem isto o pedido ficava parado para sempre na fila de não importados.
    const skuNovo = `SKU_FORA_DO_AR_${sufixo}`;
    const resultado = await ingerirPedido(orgId, brandId, contaMercadoLivreId, {
      providerOrderId: `ML-${sufixo}-FORA-DO-AR`,
      canal: "mercadolivre",
      clienteExternalId: `ml-buyer-fora-${sufixo}`,
      clienteNome: "Comprador Anúncio Pausado",
      status: "paid",
      total: "24.90",
      itens: [{
        skuExterno: skuNovo,
        quantidade: 1,
        precoUnitario: "24.90",
        listingId: `MLB-PAUSADO-${sufixo}`,
        titulo: "Varal Oval 16 Prendedores",
      }],
      criadoEm: new Date(),
    });
    pedidosParaLimpar.push(resultado.pedidoId);
    expect(resultado.novo).toBe(true);

    const [criado] = await db.select({ id: produto.id, nome: produto.nome, preco: produto.preco })
      .from(produto)
      .where(and(eq(produto.orgId, orgId), eq(produto.brandId, brandId), eq(produto.sku, skuNovo)));
    expect(criado).toMatchObject({ nome: "Varal Oval 16 Prendedores", preco: "24.90" });
    produtosParaLimpar.push(criado.id);

    // O vínculo é o que faz o próximo pedido do mesmo anúncio casar mesmo que
    // o SKU mude de novo.
    const [vinculo] = await db.select({ listingId: produtoCanal.externalListingId })
      .from(produtoCanal)
      .where(and(eq(produtoCanal.orgId, orgId), eq(produtoCanal.produtoId, criado.id)));
    expect(vinculo.listingId).toBe(`MLB-PAUSADO-${sufixo}`);

    const [identidade] = await db.select({ clienteId: clienteIdentidade.clienteId })
      .from(clienteIdentidade)
      .where(and(eq(clienteIdentidade.orgId, orgId), eq(clienteIdentidade.externalId, `ml-buyer-fora-${sufixo}`)));
    if (identidade) clientesParaLimpar.push(identidade.clienteId);
  });

  it("continua recusando o pedido quando não há SKU conhecido nem anúncio", async () => {
    // A fila de não importados continua sendo a rede de segurança: sem o
    // anúncio, adivinhar o produto seria inventar dado.
    await expect(ingerirPedido(orgId, brandId, contaMercadoLivreId, {
      providerOrderId: `ML-${sufixo}-SEM-ANUNCIO`,
      canal: "mercadolivre",
      clienteExternalId: `ml-buyer-sem-anuncio-${sufixo}`,
      clienteNome: "Comprador Sem Anúncio",
      status: "paid",
      total: "9.90",
      itens: [{ skuExterno: `SKU_INEXISTENTE_${sufixo}`, quantidade: 1, precoUnitario: "9.90" }],
      criadoEm: new Date(),
    })).rejects.toThrow(/SKUs sem produto na marca/);
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
