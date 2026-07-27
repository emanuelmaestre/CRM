import { desc, eq } from "drizzle-orm";
import pagesConfig from "@/config/pages.json";
import { db } from "@/shared/lib/db";
import { brand, cliente, regua, reguaExecucao } from "@/shared/lib/db/schema";
import { requirePageAuth } from "@/shared/lib/auth/session";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";

export const metadata = { title: pagesConfig.automacoes.metadataTitle };

function dataHora(valor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(valor);
}

export default async function AutomacoesHistoricoPage() {
  const contexto = await requirePageAuth(["admin", "gestor"]);
  const execucoes = await db
    .select({
      id: reguaExecucao.id,
      createdAt: reguaExecucao.createdAt,
      reguaNome: regua.nome,
      clienteNome: cliente.nome,
      brandNome: brand.name,
      status: reguaExecucao.status,
      gate: reguaExecucao.gateBloqueado,
      motivo: reguaExecucao.motivoBloqueio,
    })
    .from(reguaExecucao)
    .innerJoin(regua, eq(regua.id, reguaExecucao.reguaId))
    .innerJoin(cliente, eq(cliente.id, reguaExecucao.clienteId))
    .innerJoin(brand, eq(brand.id, regua.brandId))
    .where(eq(reguaExecucao.orgId, contexto.orgId))
    .orderBy(desc(reguaExecucao.createdAt))
    .limit(200);
  const copy = pagesConfig.automacoes;

  return (
    <div>
      <PageHeader title={copy.title} description={copy.description} />

      <section
        data-testid="automacoes-historico"
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
      >
        {execucoes.length === 0 ? (
          <EmptyState illustration="alerts" title={copy.empty} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {copy.columns.map((coluna) => (
                    <th key={coluna} className="px-4 py-3 font-semibold">{coluna}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {execucoes.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">{dataHora(item.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold">{item.reguaNome}</td>
                    <td className="px-4 py-3">{item.clienteNome}</td>
                    <td className="px-4 py-3">{item.brandNome}</td>
                    <td className="px-4 py-3 capitalize">{item.status.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3">{item.gate ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.motivo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
