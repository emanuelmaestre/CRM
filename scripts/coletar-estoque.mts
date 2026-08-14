// Coleta, sob demanda, o saldo que cada canal informa para os anúncios mapeados.
//
// Mesma lógica do job A5 (cron das 3h), disponível como comando para quando não
// dá para esperar a coleta diária — logo após uma migração, ao conectar um canal
// novo ou quando o estoque na tela está visivelmente velho.
//
// Reaproveita os módulos reais do projeto de propósito: o provider já carrega o
// token do banco, respeita o teto de chamadas simultâneas e faz backoff lendo o
// Retry-After. Reimplementar a chamada aqui perderia tudo isso.

import { and, eq, sql } from "drizzle-orm";

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

const TAMANHO_DO_LOTE = 50;
let coletados = 0;
const falhas: Array<{ listing: string; erro: string }> = [];

const conectados = mapeamentos.filter((item) => {
  if (item.status === "conectado") return true;
  falhas.push({ listing: item.externalListingId, erro: `conta-${item.status}` });
  return false;
});

for (let inicio = 0; inicio < conectados.length; inicio += TAMANHO_DO_LOTE) {
  const lote = conectados.slice(inicio, inicio + TAMANHO_DO_LOTE);

  // Em paralelo: o provider já limita as chamadas simultâneas e faz backoff
  // pelo Retry-After, então o lote inteiro pode ser disparado de uma vez.
  const saldos = await Promise.all(lote.map(async (item) => {
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

  if (linhas.length > 0) {
    await db
      .insert(estoqueCanalSaldo)
      .values(linhas)
      .onConflictDoUpdate({
        target: estoqueCanalSaldo.produtoCanalId,
        set: { saldo: sql`excluded.saldo`, verificadoEm: sql`excluded.verificado_em` },
      });
  }

  coletados += linhas.length;
  for (const linha of saldos.filter((x) => x.erro)) {
    falhas.push({ listing: linha.item.externalListingId, erro: linha.erro as string });
  }

  console.log(`  ${Math.min(inicio + TAMANHO_DO_LOTE, conectados.length)}/${conectados.length} — ${coletados} coletado(s), ${falhas.length} falha(s)`);
}

console.log(`\nColeta concluída: ${coletados} saldo(s) registrado(s), ${falhas.length} falha(s).`);
if (falhas.length > 0) {
  console.log("\nPrimeiras falhas:");
  for (const falha of falhas.slice(0, 10)) console.log(`  ${falha.listing}: ${falha.erro}`);
}

process.exit(0);
