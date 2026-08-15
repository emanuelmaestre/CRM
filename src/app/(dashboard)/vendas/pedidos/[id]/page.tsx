import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import pagesConfig from "@/config/pages.json";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, cliente, pedido, pedidoItem, produto } from "@/shared/lib/db/schema";
import { requirePageAuth } from "@/shared/lib/auth/session";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { podeCancelar, type PedidoStatus } from "@/modules/vendas/domain/state-machine";
import { CancelarPedidoModal } from "./cancelar-pedido-modal";

function moeda(valor: string | null): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));
}

const CORES_STATUS: Record<string, string> = {
  criado: "#6F6F6E",
  pago: "var(--info)",
  separado: "var(--info)",
  enviado: "var(--warning)",
  entregue: "var(--success)",
  avaliacao_solicitada: "var(--success)",
  concluido: "var(--success)",
  cancelado: "var(--destructive)",
  devolvido: "var(--destructive)",
};

function statusLabel(status: string): string {
  return (pagesConfig.pedidos.statusLabels as Record<string, string>)[status] ?? status;
}

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** "Mercado Livre KARZI" → "Mercado Livre · KARZI". contaNome vem pronto do
 *  banco (nome + marca concatenados sem separador); em vez de tentar montar
 *  esse texto de novo, só insere o traço no ponto onde o nome da marca
 *  aparece — sem achar, mostra cru mesmo (não quebra, só não separa). */
function contaComSeparador(contaNome: string, brandNome: string): string {
  const indice = contaNome.indexOf(brandNome);
  if (indice <= 0) return contaNome;
  return `${contaNome.slice(0, indice).trim()} · ${contaNome.slice(indice)}`;
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
      criadoEm: pedido.createdAt,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      brandNome: brand.name,
      brandSlug: brand.slug,
      contaNome: channelAccount.nome,
      canceladoMotivo: pedido.canceladoMotivo,
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

  const canManage = contexto.perfil === "admin" || contexto.perfil === "gestor";
  const podeCancelarEsse = podeCancelar(detalhe.status as PedidoStatus);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/vendas"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} strokeWidth={2} /> {copy.back}
      </Link>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
            {copy.orderPrefix}{detalhe.providerOrderId ?? detalhe.id.slice(0, 8)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="capitalize">{detalhe.canal}</span> · {dataHora.format(detalhe.criadoEm)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-testid="status-pedido"
            className="rounded-full px-3 py-1.5 text-sm font-semibold"
            style={{
              background: `color-mix(in srgb, ${CORES_STATUS[detalhe.status] ?? "#6F6F6E"} 10%, transparent)`,
              color: CORES_STATUS[detalhe.status] ?? "#6F6F6E",
            }}
          >
            {statusLabel(detalhe.status)}
          </span>
          {canManage && podeCancelarEsse && <CancelarPedidoModal pedidoId={detalhe.id} />}
        </div>
      </div>

      <dl className="mt-6 grid gap-3 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">{copy.customer}</dt>
          <dd className="mt-1 font-semibold text-foreground">
            <Link href={`/clientes/${detalhe.clienteId}`} className="transition-colors hover:text-[#9B30D9] hover:underline">
              {detalhe.clienteNome}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{copy.brand}</dt>
          <dd className="mt-1.5">
            {isBrandSlug(detalhe.brandSlug) ? (
              <BrandLogo brand={detalhe.brandSlug} height={16} />
            ) : (
              <span className="font-semibold text-foreground" style={{ color: getBrandConfig(detalhe.brandSlug)?.color }}>{detalhe.brandNome}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{copy.channel}</dt>
          <dd className="mt-1.5 flex items-center gap-2">
            <ChannelLogo canal={detalhe.canal} size="sm" variant="logo" />
            <span className="font-semibold text-foreground capitalize">{detalhe.canal}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{copy.externalAccount}</dt>
          <dd className="mt-1 font-semibold text-foreground capitalize">
            {detalhe.contaNome ? contaComSeparador(detalhe.contaNome, detalhe.brandNome) : copy.legacyAccount}
          </dd>
        </div>
      </dl>

      {detalhe.canceladoMotivo && (
        <div className="mt-3 rounded-[1.25rem] border px-5 py-3.5" style={{ borderColor: "color-mix(in srgb, #C21820 30%, transparent)", background: "color-mix(in srgb, #C21820 6%, var(--card))" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--destructive)" }}>{copy.canceledReasonLabel}</p>
          <p className="mt-0.5 text-sm text-foreground">{detalhe.canceladoMotivo}</p>
        </div>
      )}

      <div className="mt-6">
        <SectionCard title={copy.items}>
          {itens.length === 0 ? (
            <EmptyState illustration="reports" title={copy.emptyItems} className="py-6" />
          ) : (
            <div className="-mx-6 -my-6 divide-y divide-border">
              {itens.map((item) => (
                <div key={item.id} data-testid="pedido-item" data-sku={item.sku} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="font-semibold text-foreground">{item.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-muted-foreground/70">SKU:</span> {item.sku} · {copy.quantity}: {item.quantidade}
                    </p>
                  </div>
                  <span className="tabular-nums text-foreground">{moeda(item.precoUnitario)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="mt-3 grid gap-2 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] p-5 text-sm sm:ml-auto sm:w-72">
          <div className="flex justify-between text-muted-foreground">
            <span>{copy.shipping}</span><span>{moeda(detalhe.frete)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-foreground">
            <span>{copy.total}</span><span>{moeda(detalhe.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
