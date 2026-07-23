import { desc, eq } from "drizzle-orm";
import pagesConfig from "@/config/pages.json";
import { db } from "@/shared/lib/db";
import { brand, cliente, regua, reguaExecucao } from "@/shared/lib/db/schema";
import { requirePageAuth } from "@/shared/lib/auth/session";

export const metadata = { title: pagesConfig.automacoes.metadataTitle };

export default async function AutomacoesHistoricoPage() {
  const contexto = await requirePageAuth(["admin", "gestor"]);
  const execucoes = await db
    .select({ id: reguaExecucao.id, createdAt: reguaExecucao.createdAt, reguaNome: regua.nome, clienteNome: cliente.nome, brandNome: brand.name, status: reguaExecucao.status, gate: reguaExecucao.gateBloqueado, motivo: reguaExecucao.motivoBloqueio })
    .from(reguaExecucao)
    .innerJoin(regua, eq(regua.id, reguaExecucao.reguaId))
    .innerJoin(cliente, eq(cliente.id, reguaExecucao.clienteId))
    .innerJoin(brand, eq(brand.id, regua.brandId))
    .where(eq(reguaExecucao.orgId, contexto.orgId))
    .orderBy(desc(reguaExecucao.createdAt))
    .limit(200);
  const copy = pagesConfig.automacoes;

  return <div><header className="mb-6"><h1 className="text-2xl font-bold">{copy.title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></header><section data-testid="automacoes-historico" className="overflow-hidden rounded-2xl border border-border bg-card">{execucoes.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{copy.empty}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground"><tr>{copy.columns.map((coluna) => <th key={coluna} className="px-4 py-3">{coluna}</th>)}</tr></thead><tbody className="divide-y divide-border">{execucoes.map((item) => <tr key={item.id}><td className="px-4 py-3">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(item.createdAt)}</td><td className="px-4 py-3 font-semibold">{item.reguaNome}</td><td className="px-4 py-3">{item.clienteNome}</td><td className="px-4 py-3">{item.brandNome}</td><td className="px-4 py-3 capitalize">{item.status.replaceAll("_", " ")}</td><td className="px-4 py-3">{item.gate ?? "—"}</td><td className="px-4 py-3 text-muted-foreground">{item.motivo ?? "—"}</td></tr>)}</tbody></table></div>}</section></div>;
}
