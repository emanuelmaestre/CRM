import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import pagesConfig from "@/config/pages.json";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, cliente, pedido, pedidoItem, produto } from "@/shared/lib/db/schema";
import { requirePageAuth } from "@/shared/lib/auth/session";

function moeda(valor: string | null): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));
}

export default async function PedidoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, contexto] = await Promise.all([params, requirePageAuth()]);
  const detalhe = await db
    .select({
      id: pedido.id,
      providerOrderId: pedido.providerOrderId,
      status: pedido.status,
      canal: pedido.canal,
      total: pedido.total,
      frete: pedido.frete,
      clienteNome: cliente.nome,
      brandNome: brand.name,
      contaNome: channelAccount.nome,
    })
    .from(pedido)
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .innerJoin(brand, eq(brand.id, pedido.brandId))
    .leftJoin(channelAccount, eq(channelAccount.id, pedido.channelAccountId))
    .where(and(eq(pedido.id, id), eq(pedido.orgId, contexto.orgId)))
    .then((rows) => rows[0]);

  if (!detalhe) notFound();

  const itens = await db
    .select({ id: pedidoItem.id, nome: produto.nome, sku: produto.sku, quantidade: pedidoItem.quantidade, precoUnitario: pedidoItem.precoUnitario })
    .from(pedidoItem)
    .innerJoin(produto, eq(produto.id, pedidoItem.produtoId))
    .where(eq(pedidoItem.pedidoId, detalhe.id));

  const copy = pagesConfig.pedidos.detail;
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/vendas/pedidos" className="text-sm font-semibold text-muted-foreground hover:text-foreground">← {copy.back}</Link>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Pedido #{detalhe.providerOrderId ?? detalhe.id.slice(0, 8)}</h1><p className="mt-1 text-sm text-muted-foreground capitalize">{detalhe.canal}</p></div>
        <span data-testid="status-pedido" className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold capitalize">{detalhe.status.replaceAll("_", " ")}</span>
      </div>
      <dl className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[[copy.customer, detalhe.clienteNome], [copy.brand, detalhe.brandNome], [copy.channel, detalhe.canal], [copy.externalAccount, detalhe.contaNome ?? "Legado"]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold capitalize">{value}</dd></div>)}
      </dl>
      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        <h2 className="border-b border-border px-5 py-4 font-bold">{copy.items}</h2>
        {itens.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum item persistido para este pedido.</p> : <div className="divide-y divide-border">{itens.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 p-5"><div><p className="font-semibold">{item.nome}</p><p className="text-xs text-muted-foreground">{item.sku} · {copy.quantity}: {item.quantidade}</p></div><span className="tabular-nums">{moeda(item.precoUnitario)}</span></div>)}</div>}
        <div className="grid gap-2 border-t border-border bg-muted/30 p-5 text-sm sm:ml-auto sm:w-72">
          <div className="flex justify-between"><span>{copy.shipping}</span><span>{moeda(detalhe.frete)}</span></div>
          <div className="flex justify-between text-base font-bold"><span>{copy.total}</span><span>{moeda(detalhe.total)}</span></div>
        </div>
      </section>
    </div>
  );
}
