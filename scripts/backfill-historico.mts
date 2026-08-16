// Backfill sob demanda do histórico de pedidos do Mercado Livre, reaproveitando
// o pipeline real de importação histórica (mesma validação, mesmas proteções:
// não mexe em estoque, não dispara automação, preserva a data original do
// pedido). Existe porque a sincronização em tempo real (A24) só cobre pedidos
// a partir do momento em que a conta foi conectada — tudo anterior a isso
// nunca entra sozinho, e é isso que este script cobre.
//
// Uso: node --env-file=.env.local --import tsx scripts/backfill-historico.mts [slug...]
// Sem argumentos, roda para karzi, wuwu e armarinhos_lima.

const { db } = await import("@/shared/lib/db");
const {
  criarLoteHistorico,
  prepararPaginaLoteHistorico,
  finalizarPreparacaoLoteHistorico,
  confirmarLoteHistorico,
  importarProximoBlocoHistorico,
  finalizarImportacaoLoteHistorico,
  obterLoteHistorico,
} = await import("@/modules/importacao/application/importacao-historica.service");

const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID não encontrada — defina no ambiente ou em .env.local.");

const ADMIN_USER_ID = process.env.BACKFILL_ADMIN_USER_ID;
if (!ADMIN_USER_ID) throw new Error("BACKFILL_ADMIN_USER_ID não encontrada — defina o id de um usuário admin da org.");

const ctx = { db, orgId, userId: ADMIN_USER_ID, perfil: "admin" as const };

const slugs = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ["karzi", "wuwu", "armarinhos_lima"];

// 3 anos cobre qualquer conta razoavelmente nova; ML simplesmente devolve
// zero resultados para o trecho anterior à existência real da conta.
const de = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString();
const ate = new Date(Date.now() - 60_000).toISOString();

for (const brand of slugs) {
  console.log(`\n=== ${brand} ===`);
  try {
    const { loteId } = await criarLoteHistorico(ctx, { brand, de, ate });
    console.log(`lote criado: ${loteId}`);

    let offset = 0;
    for (;;) {
      const pagina = await prepararPaginaLoteHistorico(loteId, offset);
      console.log(`  coleta: ${pagina.processados}/${pagina.total}`);
      if (pagina.encontrou === 0 || pagina.proximoOffset >= pagina.total) break;
      offset = pagina.proximoOffset;
    }

    const resumoPreparacao = await finalizarPreparacaoLoteHistorico(loteId);
    console.log(`  preparado: ${JSON.stringify(resumoPreparacao)}`);

    if (resumoPreparacao.aceitos === 0) {
      console.log("  nada para importar (tudo duplicado, em quarentena ou vazio).");
      const detalhe = await obterLoteHistorico(ctx, loteId);
      if (detalhe.pendencias.length > 0) console.log("  pendências (amostra):", detalhe.pendencias);
      continue;
    }

    await confirmarLoteHistorico(ctx, loteId);

    for (;;) {
      const bloco = await importarProximoBlocoHistorico(loteId, 50);
      console.log(`  importando: +${bloco.importados} importados, +${bloco.duplicados} duplicados, +${bloco.erros} erros (processados ${bloco.processados})`);
      if (bloco.encontrados === 0) break;
    }

    const resumoFinal = await finalizarImportacaoLoteHistorico(loteId);
    console.log(`  concluído: ${JSON.stringify(resumoFinal)}`);
  } catch (error) {
    console.error(`  falhou: ${error instanceof Error ? error.message : String(error)}`);
  }
}

process.exit(0);
