import Link from "next/link";
import { ArrowLeft, MapPin, Database, Clock3, Package, Truck, Tag, Percent, TrendingUp, Wallet } from "lucide-react";
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
import { liquidoDoPedido, liquidoFoiInformado } from "@/modules/vendas/domain/liquido-pedido";
import { CancelarPedidoModal } from "./cancelar-pedido-modal";
import { StatusPedidoBadge } from "./status-pedido-badge";

function moeda(valor: string | null): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));
}

const CORES_STATUS: Record<string, string> = {
  criado: "var(--muted-foreground)",
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
  // Case-insensitive: contaNome pode vir "Mercado Livre Armarinhos Lima"
  // (título) enquanto brandNome é "ARMARINHOS LIMA" (maiúsculo, como fica
  // guardado em brand.name) — comparar cru nunca batia, então o traço nunca
  // aparecia pra essa marca.
  const indice = contaNome.toLocaleLowerCase("pt-BR").indexOf(brandNome.toLocaleLowerCase("pt-BR"));
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
      desconto: pedido.desconto,
      acrescimo: pedido.acrescimo,
      valorLiquido: pedido.valorLiquido,
      criadoEm: pedido.createdAt,
      recebidoEm: pedido.receivedAt,
      atualizadoEm: pedido.updatedAt,
      origemIngestao: pedido.origemIngestao,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      enderecoRua: cliente.enderecoRua,
      enderecoNumero: cliente.enderecoNumero,
      enderecoComplemento: cliente.enderecoComplemento,
      enderecoBairro: cliente.enderecoBairro,
      enderecoCidade: cliente.enderecoCidade,
      enderecoEstado: cliente.enderecoEstado,
      enderecoCep: cliente.enderecoCep,
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
    .select({ id: pedidoItem.id, nome: produto.nome, sku: produto.sku, quantidade: pedidoItem.quantidade, precoUnitario: pedidoItem.precoUnitario, taxaMarketplace: pedidoItem.taxaMarketplace })
    .from(pedidoItem)
    .innerJoin(produto, eq(produto.id, pedidoItem.produtoId))
    .where(eq(pedidoItem.pedidoId, detalhe.id));

  const copy = pagesConfig.pedidos.detail;

  const canManage = contexto.perfil === "admin" || contexto.perfil === "gestor";
  const podeCancelarEsse = podeCancelar(detalhe.status as PedidoStatus);
  const subtotalItens = itens.reduce((soma, item) => soma + Number(item.precoUnitario) * item.quantidade, 0);
  const taxasConhecidas = itens.reduce((soma, item) => soma + Number(item.taxaMarketplace ?? 0), 0);
  // A regra (repasse do canal manda, estimativa só na falta dele) vive em
  // liquido-pedido.ts, junto do porquê e do tamanho medido da diferença.
  const liquidoInformado = liquidoFoiInformado(detalhe.valorLiquido);
  const valorLiquido = liquidoDoPedido({
    total: detalhe.total,
    frete: detalhe.frete,
    valorLiquido: detalhe.valorLiquido,
    taxasConhecidas,
  });
  const endereco = [
    [detalhe.enderecoRua, detalhe.enderecoNumero].filter(Boolean).join(", "),
    detalhe.enderecoComplemento,
    detalhe.enderecoBairro,
    [detalhe.enderecoCidade, detalhe.enderecoEstado].filter(Boolean).join("/"),
    detalhe.enderecoCep ? `CEP ${detalhe.enderecoCep}` : null,
  ].filter(Boolean).join(" · ");

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
          <StatusPedidoBadge
            key={detalhe.status}
            label={statusLabel(detalhe.status)}
            cor={CORES_STATUS[detalhe.status] ?? "var(--muted-foreground)"}
          />
          {canManage && podeCancelarEsse && <CancelarPedidoModal pedidoId={detalhe.id} />}
        </div>
      </div>

      <dl className="mt-6 grid gap-x-5 gap-y-3 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] p-5 text-center sm:grid-cols-2 sm:text-left lg:flex lg:items-start lg:justify-between lg:gap-x-8">
        <div className="min-w-0 lg:flex-1">
          <dt className="text-xs text-muted-foreground">{copy.customer}</dt>
          <dd className="mt-1 truncate font-semibold text-foreground">
            <Link
              href={`/clientes/${detalhe.clienteId}`}
              title={detalhe.clienteNome}
              className="transition-colors hover:text-selecionado hover:underline"
            >
              {detalhe.clienteNome}
            </Link>
          </dd>
        </div>
        <div className="lg:shrink-0">
          <dt className="text-xs text-muted-foreground">{copy.brand}</dt>
          <dd className="mt-1.5 flex justify-center sm:justify-start">
            {isBrandSlug(detalhe.brandSlug) ? (
              <BrandLogo brand={detalhe.brandSlug} height={16} />
            ) : (
              <span className="font-semibold text-foreground" style={{ color: getBrandConfig(detalhe.brandSlug)?.color }}>{detalhe.brandNome}</span>
            )}
          </dd>
        </div>
        <div className="lg:shrink-0">
          <dt className="text-xs text-muted-foreground">{copy.channel}</dt>
          <dd className="mt-1.5 flex justify-center sm:justify-start">
            <ChannelLogo canal={detalhe.canal} size="sm" variant="logo" />
          </dd>
        </div>
        <div className="lg:shrink-0">
          <dt className="text-xs text-muted-foreground">{copy.externalAccount}</dt>
          <dd className="mt-1 font-semibold text-foreground capitalize">
            {detalhe.contaNome ? contaComSeparador(detalhe.contaNome, detalhe.brandNome) : copy.legacyAccount}
          </dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section className="rounded-[1.25rem] bg-card p-5 shadow-[0_2px_16px_rgba(14,15,19,.07)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><MapPin size={14} /> Endereço de entrega</div>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-foreground">{endereco || "Endereço ainda não recebido do canal."}</p>
        </section>
        <section className="rounded-[1.25rem] bg-card p-5 shadow-[0_2px_16px_rgba(14,15,19,.07)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Database size={14} /> Origem e sincronização</div>
          <dl className="mt-2 grid gap-1 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Origem</dt><dd className="font-semibold capitalize">{detalhe.origemIngestao.replaceAll("_", " ")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Recebido no CRM</dt><dd className="font-semibold tabular-nums">{dataHora.format(detalhe.recebidoEm)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Última atualização</dt><dd className="font-semibold tabular-nums">{dataHora.format(detalhe.atualizadoEm)}</dd></div>
          </dl>
        </section>
      </div>

      {detalhe.canceladoMotivo && (
        <div className="mt-3 rounded-[1.25rem] border px-5 py-3.5" style={{ borderColor: "color-mix(in srgb, var(--destructive) 30%, transparent)", background: "color-mix(in srgb, var(--destructive) 6%, var(--card))" }}>
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
                <div key={item.id} data-testid="pedido-item" data-sku={item.sku} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{item.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-muted-foreground/70">SKU:</span> {item.sku} · {copy.quantity}: {item.quantidade}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-start sm:text-right">
                    <span className="font-semibold tabular-nums text-foreground">{moeda(String(Number(item.precoUnitario) * item.quantidade))}</span>
                    <span className="flex flex-col items-end gap-0.5 text-xs tabular-nums text-muted-foreground">
                      <span>{moeda(item.precoUnitario)} cada</span>
                      {item.taxaMarketplace != null && <span>taxa {moeda(item.taxaMarketplace)}</span>}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_18rem] sm:items-stretch sm:justify-end">
          <section className="flex h-full flex-col rounded-[1.25rem] bg-card p-5 shadow-[0_2px_16px_rgba(14,15,19,.07)]">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Wallet size={14} /> O que compõe esses valores
            </div>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Package, label: "Subtotal dos itens", desc: "Soma do preço unitário de cada item vezes a quantidade vendida, antes de qualquer ajuste." },
                { icon: Truck, label: copy.shipping, desc: "Valor do frete informado pelo canal. Fica em R$ 0,00 quando o canal não repassa esse dado." },
                { icon: Tag, label: "Descontos", desc: "Reduções aplicadas ao pedido (cupom, promoção). Fica em R$ 0,00 quando o canal não informa." },
                { icon: Percent, label: "Taxa do canal de venda", desc: "Comissão cobrada pelo canal (Mercado Livre, Shopee, TikTok Shop etc.) sobre essa venda. Fica em R$ 0,00 quando o canal não informa." },
                { icon: TrendingUp, label: "Acréscimos", desc: "Valores somados ao pedido (juros, taxa extra). Fica em R$ 0,00 quando o canal não informa." },
                { icon: Wallet, label: "Valor líquido", desc: "Repasse líquido informado pelo canal. Quando o canal não envia esse dado, é estimado descontando frete e taxas do total." },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-selecionado/10 text-selecionado">
                    <Icon size={13} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{label}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </dl>
          </section>

          <div className="grid h-full content-center gap-2 rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] p-5 text-sm sm:w-72">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal dos itens</span><span>{moeda(String(subtotalItens))}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{copy.shipping}</span><span>{moeda(detalhe.frete)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Descontos</span>
              <span>{Number(detalhe.desconto ?? 0) > 0 ? `- ${moeda(detalhe.desconto)}` : moeda(detalhe.desconto)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxa do canal de venda</span><span>{moeda(String(taxasConhecidas))}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Acréscimos</span>
              <span>{Number(detalhe.acrescimo ?? 0) > 0 ? `+ ${moeda(detalhe.acrescimo)}` : moeda(detalhe.acrescimo)}</span>
            </div>
            <div className="my-1 h-px bg-border" />
            <div className="flex justify-between text-base font-bold text-foreground">
              <span>{copy.total}</span><span>{moeda(detalhe.total)}</span>
            </div>
            <div className="flex justify-between text-base font-bold" style={{ color: "var(--success)" }}>
              <span>Valor líquido</span><span>{moeda(String(valorLiquido))}</span>
            </div>
            {/* Os dois números moram na mesma linha da tela, mas não têm o mesmo
                peso: um é o repasse que o canal fechou, o outro é conta nossa
                por falta de dado melhor. Sem dizer qual é qual, quem confere
                com o extrato do canal não sabe se uma diferença é erro do CRM
                ou limitação da fonte. */}
            <p className="-mt-1 text-right text-[11px] font-medium text-muted-foreground">
              {liquidoInformado ? "repasse informado pelo canal" : "estimado: total - taxas - frete"}
            </p>
          </div>
        </div>

        <div
          className="mt-3 flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-center"
          style={{ borderColor: "color-mix(in srgb, var(--selecionado) 25%, transparent)", background: "color-mix(in srgb, var(--selecionado) 6%, var(--card))" }}
        >
          <Clock3 size={13} className="hidden shrink-0 text-selecionado lg:block" />
          <p className="text-xs font-medium leading-relaxed text-foreground lg:whitespace-nowrap">
            Quando o canal não informa frete, taxas, desconto ou acréscimo, o valor aparece como R$ 0,00. Na Shopee, o valor líquido usa o repasse calculado pelo próprio canal.
          </p>
        </div>
      </div>
    </div>
  );
}
