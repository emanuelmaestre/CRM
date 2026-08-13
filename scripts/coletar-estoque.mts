// Coleta, sob demanda, o saldo que cada canal informa para os anúncios mapeados.
//
// Mesma lógica do job A5 (cron das 3h), disponível como comando para quando não
// dá para esperar a coleta diária — logo após uma migração, ao conectar um canal
// novo ou quando o estoque na tela está visivelmente velho.
//
// Reaproveita os módulos reais do projeto de propósito: o provider já carrega o
// token do banco, respeita o teto de chamadas simultâneas e faz backoff lendo o
// Retry-After. Reimplementar a chamada aqui perderia tudo isso.

import { and, eq } from "drizzle-orm";

// Import por namespace e não nomeado: os módulos do projeto são transpilados
// para CJS aqui, e o schema reexporta com `export *`, que o carregador ESM do
// Node não consegue analisar estaticamente — o nomeado falharia no import.
const { db } = await import("@/shared/lib/db");
const { brand, channelAccount, estoqueCanalSaldo, produtoCanal } = await import("@/shared/lib/db/schema");
const { executarComRetry } = await import("@/modules/canais/application/retry");
const { resolverChannelProvider } = await import("@/modules/canais/infrastructure/provider-resolver");

const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID não encontrada — defina no ambiente ou em .env.local.");

const mapeamentos = await db
  .select({
    produtoCanalId: produtoCanal.id,
    produtoId: produtoCanal.produtoId,
    externalListingId: produtoCanal.externalListingId,
    externalSkuId: produtoCanal.externalSkuId,
    externalWarehouseId: produtoCanal.externalWarehouseId,
    channelAccountId: channelAccount.id,
    tipo: channelAccount.tipo,
    status: channelAccount.status,
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
  .where(and(eq(produtoCanal.orgId, orgId), eq(produtoCanal.ativo, true)));

console.log(`${mapeamentos.length} mapeamento(s) ativo(s) para coletar.`);

let coletados = 0;
const falhas: Array<{ listing: string; erro: string }> = [];

for (const [indice, item] of mapeamentos.entries()) {
  if (item.status !== "conectado") {
    falhas.push({ listing: item.externalListingId, erro: `conta-${item.status}` });
    continue;
  }

  try {
    const provider = await resolverChannelProvider(item.tipo, item.brandSlug);
    if (!provider) throw new Error(`Provider ${item.tipo}/${item.brandSlug} não suportado.`);

    const saldo = await executarComRetry(
      () => provider.consultarEstoque({
        listingId: item.externalListingId,
        skuId: item.externalSkuId,
        warehouseId: item.externalWarehouseId,
      }),
      { tentativas: 2, atrasoInicialMs: 250 },
    );

    await db
      .insert(estoqueCanalSaldo)
      .values({
        orgId,
        produtoId: item.produtoId,
        channelAccountId: item.channelAccountId,
        produtoCanalId: item.produtoCanalId,
        saldo,
        verificadoEm: new Date(),
      })
      .onConflictDoUpdate({
        target: estoqueCanalSaldo.produtoCanalId,
        set: { saldo, verificadoEm: new Date() },
      });

    coletados++;
  } catch (error) {
    falhas.push({ listing: item.externalListingId, erro: String(error) });
  }

  // Uma linha por bloco de 50 em vez de por item: o objetivo é acompanhar o
  // avanço de uma coleta de vários minutos sem inundar o terminal.
  if ((indice + 1) % 50 === 0 || indice === mapeamentos.length - 1) {
    console.log(`  ${indice + 1}/${mapeamentos.length} — ${coletados} coletado(s), ${falhas.length} falha(s)`);
  }
}

console.log(`\nColeta concluída: ${coletados} saldo(s) registrado(s), ${falhas.length} falha(s).`);
if (falhas.length > 0) {
  console.log("\nPrimeiras falhas:");
  for (const falha of falhas.slice(0, 10)) console.log(`  ${falha.listing}: ${falha.erro}`);
}

process.exit(0);
