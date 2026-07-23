import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import pagesConfig from "@/config/pages.json";
import { VendasTabs } from "../vendas-tabs";
import { db } from "@/shared/lib/db";
import { brand, cliente, pedido } from "@/shared/lib/db/schema";
import { requirePageAuth } from "@/shared/lib/auth/session";

export const metadata = { title: pagesConfig.pedidos.metadataTitle };

function moeda(valor: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor));
}

function dataHora(valor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(valor);
}

export default async function PedidosPage() {
  const contexto = await requirePageAuth();
  const pedidos = await db
    .select({
      id: pedido.id,
      providerOrderId: pedido.providerOrderId,
      clienteNome: cliente.nome,
      brandNome: brand.name,
      canal: pedido.canal,
      status: pedido.status,
      total: pedido.total,
      createdAt: pedido.createdAt,
    })
    .from(pedido)
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .innerJoin(brand, eq(brand.id, pedido.brandId))
    .where(eq(pedido.orgId, contexto.orgId))
    .orderBy(desc(pedido.createdAt))
    .limit(200);

  return (
    <>
      <VendasTabs active="pedidos" />
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{pagesConfig.pedidos.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{pagesConfig.pedidos.description}</p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-border bg-card" data-testid="pedidos-lista">
        {pedidos.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{pagesConfig.pedidos.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>{pagesConfig.pedidos.columns.map((coluna) => <th key={coluna} className="px-4 py-3 font-semibold">{coluna}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pedidos.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold"><Link className="hover:underline" href={`/vendas/pedidos/${item.id}`}>#{item.providerOrderId ?? item.id.slice(0, 8)}</Link></td>
                    <td className="px-4 py-3">{item.clienteNome}</td>
                    <td className="px-4 py-3">{item.brandNome}</td>
                    <td className="px-4 py-3 capitalize">{item.canal}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">{item.status.replaceAll("_", " ")}</span></td>
                    <td className="px-4 py-3 tabular-nums">{moeda(item.total)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{dataHora(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
