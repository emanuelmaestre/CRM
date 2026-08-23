// Diagnóstico pontual: imprime a série que o card de Faturamento recebe
// para o período "Hoje", pra conferir se o baldeamento por hora está de
// fato produzindo vários pontos (zigue-zague) ou caindo num ponto só.
//
// Uso:
//   node --env-file=.env.local --import tsx scripts/diag-serie-faturamento.mts

const { db } = await import("@/shared/lib/db");
const { obterDashboardData } = await import("@/modules/metricas/application/dashboard.service");

const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID não encontrada — defina no ambiente ou em .env.local.");

const ctx = { db, orgId, perfil: "admin" as const };

const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD

console.log(`Período "Hoje" = ${hoje}\n`);

const dados = await obterDashboardData(ctx, { inicio: hoje, fim: hoje });
const f = dados.faturamento;

console.log("granularidade :", f.granularidade);
console.log("total         :", f.total);
console.log("pedidos       :", f.pedidos);
console.log("serie.length  :", f.serie.length);
console.log("\nsérie completa:");
for (const p of f.serie) {
  const barra = "█".repeat(Math.round(p.altura / 4));
  console.log(`  ${p.label.padEnd(8)} ${String(p.valor.toFixed(2)).padStart(10)}  ${barra}`);
}
