"use client";

import { tint } from "@/shared/design-system/color";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Check, CircleDot, Download, History, Info, MapPin, Package, Pencil, ShoppingBag, Star, Truck, WalletCards, X, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { isBrandSlug } from "@/shared/config/brands";
import { actionAtualizarCliente } from "../actions";
import { exportarClientePDF } from "../exportar-pdf";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.clientes.detail;

type ClienteData = {
  cliente: Record<string, unknown> & {
    id: string; nome: string; email?: string | null; telefone?: string | null; cpfCnpj?: string | null;
    nomeCompleto?: string | null;
    enderecoRua?: string | null; enderecoNumero?: string | null; enderecoComplemento?: string | null;
    enderecoBairro?: string | null; enderecoCidade?: string | null; enderecoEstado?: string | null;
    enderecoCep?: string | null; enderecoLatitude?: number | null; enderecoLongitude?: number | null;
  };
  interacoes: Array<{ id: string; tipo: string; resumo: string | null; canal: string | null; createdAt: Date | string }>;
  anotacoes: Array<{ id: string; resumo: string | null; createdAt: Date | string }>;
  pedidos: Array<{
    id: string; canal: string; status: string; total: string; frete?: string | null;
    providerOrderId?: string | null; createdAt: Date | string;
  }>;
  consentimentos: Array<{ id: string; finalidade: string; canal: string; status: string }>;
  tags: Array<{ id: string; nome: string; cor: string | null }>;
  canais?: string[];
  score: {
    churnRisk: number;
    segmento: string | null;
    acaoSugerida: string | null;
    proximaCompraEstimada: Date | string | null;
    probabilidadeRecompra30d: number | null;
    calculadoEm: Date | string;
  } | null;
  resumoComercial: {
    totalPedidos: number; totalGasto: number; ticketMedio: number;
    primeiroPedidoEm: Date | string | null; ultimoPedidoEm: Date | string | null; diasSemComprar: number | null;
    cancelados: number; devolvidos: number;
    marcaPreferida: { id: string; nome: string; slug: string; total: number } | null;
    canalPreferido: { canal: string; total: number } | null;
    produtosMaisComprados: Array<{ produtoId: string; nome: string; quantidade: number }>;
  };
  classificacaoRelacionamento: { chave: string; label: string; motivo: string };
  mensagens: Array<{ id: string; conversaId: string; canal: string; direcao: string; conteudo: string; status: string; createdAt: Date | string }>;
  tarefas: Array<{ id: string; resumo: string | null; meta: unknown; createdAt: Date | string }>;
  usuarios: Array<{ id: string; nome: string }>;
};

const SEGMENTO_COR: Record<string, string> = {
  "Campeão": "var(--success)",
  "Leal": "var(--info)",
  "Em risco": "var(--warning)",
  "Adormecido": "var(--escala-2)",
  "Perdido": "var(--destructive)",
};

const STATUS_PEDIDO: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  criado: { label: "Criado", color: "var(--muted-foreground)", icon: CircleDot },
  pago: { label: "Pago", color: "var(--success)", icon: Check },
  separado: { label: "Separado", color: "var(--info)", icon: Package },
  enviado: { label: "Enviado", color: "var(--info)", icon: Truck },
  entregue: { label: "Entregue", color: "var(--success)", icon: Check },
  avaliacao_solicitada: { label: "Avaliação solicitada", color: "var(--muted-foreground)", icon: CircleDot },
  concluido: { label: "Concluído", color: "var(--success)", icon: Check },
  cancelado: { label: "Cancelado", color: "var(--destructive)", icon: XCircle },
  devolvido: { label: "Devolvido", color: "var(--destructive)", icon: XCircle },
};

function StatusPedidoBadge({ status }: { status: string }) {
  const info = STATUS_PEDIDO[status] ?? { label: status, color: "var(--muted-foreground)", icon: CircleDot };
  const Icon = info.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: info.color, background: tint(info.color, 9) }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {info.label}
    </span>
  );
}

/** Linha da timeline unificada — canal vira ícone (não texto), status de
 *  pedido vira selo colorido em vez de string solta, e a data fica isolada à
 *  direita: as três informações eram um texto corrido difícil de escanear. */
function TimelineItem({ canal, title, orderNumber, subtitle, status, date }: {
  canal?: string | null;
  title: string;
  orderNumber?: string | null;
  subtitle?: string | null;
  status?: string | null;
  date: Date | string;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
      {canal && <ChannelLogo canal={canal} size="xs" variant="logo" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate flex items-center gap-2">
          {title}
          {orderNumber && (
            <span className="font-mono text-[11px] font-normal text-muted-foreground">#{orderNumber}</span>
          )}
        </p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 pl-7 sm:pl-0">
        {status && <StatusPedidoBadge status={status} />}
        <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(date)}</span>
      </div>
    </div>
  );
}

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Sem dado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

/** O endereço já chega estruturado do canal (ver clientes.ts) — aqui só
 *  organiza em campos rotulados em vez de uma única linha corrida, pra ficar
 *  fácil de ler cada parte (rua, número, bairro, cidade, estado, complemento)
 *  sem precisar decifrar um texto concatenado. */
function partesEndereco(c: ClienteData["cliente"]) {
  return [
    { label: "Rua/Av", value: c.enderecoRua },
    { label: "Número", value: c.enderecoNumero },
    { label: "Bairro", value: c.enderecoBairro },
    { label: "Cidade", value: c.enderecoCidade },
    { label: "Estado", value: c.enderecoEstado },
    { label: "CEP", value: c.enderecoCep },
  ].map((item) => ({ label: item.label, value: item.value?.trim() || null }));
}

/** Complemento costuma vir como texto livre — às vezes uma referência inteira
 *  ("procurar por fulano, perto da policlínica...") — e não cabe na mesma
 *  grade compacta dos campos estruturados sem deformar as colunas ao redor.
 *  Fica isolado numa linha própria. */
function complementoEndereco(c: ClienteData["cliente"]) {
  return c.enderecoComplemento?.trim() || null;
}

export function Cliente360({
  initialData,
}: {
  initialData: ClienteData;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const cliente = data.cliente;

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const atualizado = await actionAtualizarCliente(cliente.id, formData);
        setData((current) => ({ ...current, cliente: { ...current.cliente, ...atualizado } }));
        setEditing(false);
        toast.success(copy.messages.updateSuccess);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : copy.messages.updateError);
      }
    });
  }

  return (
    <div className="space-y-5" data-testid="cliente-360">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/clientes")}
            title={copy.actions.back}
            aria-label={copy.actions.back}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] transition-colors hover:bg-muted"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Clientes</p>
            <p className="truncate text-sm font-semibold text-foreground">{cliente.nomeCompleto?.trim() || cliente.nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportarClientePDF(data).catch(() => toast.error("Não foi possível gerar o PDF."))}
            title="Exportar ficha em PDF"
            aria-label="Exportar ficha em PDF"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] transition-colors hover:bg-muted"
          >
            <Download size={17} /><span className="hidden sm:inline">PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            title={editing ? copy.actions.cancel : copy.actions.edit}
            aria-label={editing ? copy.actions.cancel : copy.actions.edit}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] transition-colors hover:bg-muted"
          >
            {editing ? <X size={14} /> : <Pencil size={14} />}
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-[0_2px_16px_rgba(14,15,19,.05)]">
        {editing ? (
          <form action={submit} className="grid gap-4 p-5 md:grid-cols-2">
            <div className="md:col-span-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Editar cadastro</p><h1 className="mt-1 text-xl font-bold text-foreground">Dados do cliente</h1></div>
            <label className="space-y-1.5 text-sm"><span>{copy.fields.name}</span><input name="nome" required minLength={2} defaultValue={cliente.nome} className="min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span>{copy.fields.email}</span><input name="email" type="email" defaultValue={cliente.email ?? ""} className="min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span>{copy.fields.phone}</span><input name="telefone" defaultValue={cliente.telefone ?? ""} className="min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
            <label className="space-y-1.5 text-sm"><span>{copy.fields.document}</span><input name="cpfCnpj" defaultValue={cliente.cpfCnpj ?? ""} className="min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
            <button disabled={pending} className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-xl px-5 font-semibold text-white disabled:opacity-50 md:col-span-2" style={{ background: "var(--gradient-signature)" }}>
              <Check size={17} /> {pending ? copy.actions.saving : copy.actions.save}
            </button>
          </form>
        ) : (
          <div className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Perfil do cliente</p>
                <h1 className="inline-flex flex-wrap items-center gap-2 text-2xl font-bold text-foreground">
                  {cliente.nomeCompleto?.trim() || cliente.nome}
                  {data.canais && data.canais.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      {data.canais.map((canal) => (
                        <ChannelLogo key={canal} canal={canal} size="xs" variant="logo" />
                      ))}
                    </span>
                  )}
                </h1>
                {cliente.nomeCompleto?.trim() && cliente.nomeCompleto.trim() !== cliente.nome && (
                  <p className="text-xs text-muted-foreground mt-0.5">{copy.address.nicknameLabel}: {cliente.nome}</p>
                )}
                {(cliente.email || cliente.telefone) && (
                  <p className="text-sm text-muted-foreground mt-1">{[cliente.email, cliente.telefone].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">{data.tags.map((tag) => <span key={tag.id} className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: tag.cor ?? undefined, background: tint(tag.cor ?? "var(--tag-fallback)", 12) }}>{tag.nome}</span>)}</div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Total comprado", value: dinheiro.format(data.resumoComercial.totalGasto), icon: WalletCards },
                { label: "Pedidos", value: String(data.resumoComercial.totalPedidos), icon: ShoppingBag },
                { label: "Ticket médio", value: dinheiro.format(data.resumoComercial.ticketMedio), icon: Star },
                { label: "Última compra", value: data.resumoComercial.ultimoPedidoEm ? new Date(data.resumoComercial.ultimoPedidoEm).toLocaleDateString("pt-BR") : "Sem dado", icon: CalendarDays },
              ].map((item) => {
                const Icon = item.icon;
                return <div key={item.label} className="rounded-xl border border-border bg-muted/20 p-3.5"><dt className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={14} /></span>{item.label}</dt><dd className="mt-2 text-lg font-bold tabular-nums">{item.value}</dd></div>;
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-border pb-4 text-xs">
              <span className="mr-1 font-medium text-muted-foreground">Perfil comercial</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">{data.classificacaoRelacionamento.label}</span>
              <span className="text-muted-foreground">{data.classificacaoRelacionamento.motivo}</span>
              {data.resumoComercial.marcaPreferida && <span title={`Marca preferida: ${data.resumoComercial.marcaPreferida.nome}`} className="inline-flex min-h-8 items-center gap-2 rounded-full bg-muted px-3 py-1"><span className="text-muted-foreground">Marca preferida</span>{isBrandSlug(data.resumoComercial.marcaPreferida.slug) ? <BrandLogo brand={data.resumoComercial.marcaPreferida.slug} height={14} /> : <b>{data.resumoComercial.marcaPreferida.nome}</b>}</span>}
              {data.resumoComercial.canalPreferido && <span title={`Canal preferido: ${data.resumoComercial.canalPreferido.canal}`} className="inline-flex min-h-8 items-center gap-2 rounded-full bg-muted px-3 py-1"><span className="text-muted-foreground">Canal preferido</span><ChannelLogo canal={data.resumoComercial.canalPreferido.canal} size="sm" variant="logo" /></span>}
              {(data.resumoComercial.cancelados > 0 || data.resumoComercial.devolvidos > 0) && <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">{data.resumoComercial.cancelados} cancelado(s) · {data.resumoComercial.devolvidos} devolvido(s)</span>}
            </div>
            {(() => {
              const partes = partesEndereco(cliente);
              const complemento = complementoEndereco(cliente);
              const tudoPendente = partes.every((item) => !item.value) && !complemento;
              return (
                <div className="mt-4 rounded-xl bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapPin size={15} /></span><p className="text-sm font-semibold text-foreground">{copy.address.title}</p></div>
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
                    {partes.map((item) => (
                      <div key={item.label}>
                        <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
                        {item.value ? (
                          <dd className="text-sm font-medium text-foreground mt-0.5">{item.value}</dd>
                        ) : (
                          <dd className="text-sm italic font-medium mt-0.5" style={{ color: "var(--warning)" }}>{copy.address.pendingField}</dd>
                        )}
                      </div>
                    ))}
                  </dl>
                  {complemento && (
                    <div className="mt-3 border-t border-border/60 pt-3">
                      <dt className="text-[11px] text-muted-foreground">Complemento</dt>
                      <dd className="mt-0.5 text-sm font-medium leading-relaxed text-foreground">{complemento}</dd>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                    {tudoPendente ? (
                      <p
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium"
                        style={{ color: "var(--warning)", background: "color-mix(in srgb, #B57A00 10%, transparent)" }}
                      >
                        <Info aria-hidden="true" size={12} strokeWidth={2.25} className="shrink-0" />
                        {copy.address.pendingSubtitle}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Info aria-hidden="true" size={12} strokeWidth={2} className="shrink-0" />
                        {copy.address.subtitle}
                      </p>
                    )}
                    {cliente.enderecoLatitude != null && cliente.enderecoLongitude != null && (
                      <a
                        href={`https://www.google.com/maps?q=${cliente.enderecoLatitude},${cliente.enderecoLongitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                      >
                        <MapPin size={12} strokeWidth={2.25} />
                        {copy.address.viewOnMap}
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {data.score && (
        <section className="rounded-[1.25rem] border border-border bg-card p-5" data-testid="cliente-inteligencia">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h2 className="font-semibold">{copy.intelligenceTitle}</h2>
            {data.score.segmento && (
              <span
                className="px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{
                  color: SEGMENTO_COR[data.score.segmento] ?? "var(--tag-fallback)",
                  background: tint(SEGMENTO_COR[data.score.segmento] ?? "var(--tag-fallback)", 12),
                }}
              >
                {data.score.segmento}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{copy.churnRiskLabel}: {data.score.churnRisk}%</span>
          </div>
          {data.score.acaoSugerida && <p className="text-sm">{data.score.acaoSugerida}</p>}
          {data.score.proximaCompraEstimada && (
            <p className="text-xs text-muted-foreground mt-1">
              {copy.nextPurchaseLabel}: {formatDate(data.score.proximaCompraEstimada)}
            </p>
          )}
          {data.score.probabilidadeRecompra30d != null && (
            <p className="text-xs text-muted-foreground mt-1">
              {copy.repurchaseProbabilityLabel}: {data.score.probabilidadeRecompra30d}%
            </p>
          )}
        </section>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[1.45fr_1fr]">
        <section className="overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-[0_2px_16px_rgba(14,15,19,.04)]">
          <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="flex items-center gap-2 font-semibold"><History size={17} className="text-primary" />{copy.timelineTitle}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{data.interacoes.length + data.pedidos.length + data.mensagens.length}</span></div>
          <div className="divide-y divide-border">
            {[
              ...data.interacoes.map((item) => ({
                key: `i-${item.id}`,
                canal: item.canal,
                title: item.resumo ?? item.tipo,
                subtitle: null as string | null,
                status: null as string | null,
                date: item.createdAt,
              })),
              ...data.pedidos.map((item) => ({
                key: `p-${item.id}`,
                canal: item.canal,
                title: copy.orderPrefix,
                orderNumber: item.providerOrderId ?? null,
                subtitle: [
                  `Total: ${dinheiro.format(Number(item.total))}`,
                  item.frete && Number(item.frete) > 0 ? `frete ${dinheiro.format(Number(item.frete))}` : null,
                ].filter(Boolean).join(" · ") || null,
                status: item.status,
                date: item.createdAt,
              })),
              ...data.mensagens.map((item) => ({
                key: `m-${item.id}`,
                canal: item.canal,
                title: item.direcao === "entrada" ? "Mensagem recebida" : "Resposta enviada",
                subtitle: item.conteudo,
                status: null as string | null,
                date: item.createdAt,
              })),
            ]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map(({ key, ...item }) => <TimelineItem key={key} {...item} />)}
            {data.interacoes.length + data.pedidos.length + data.mensagens.length === 0 && <p className="p-5 text-sm text-muted-foreground">{copy.timelineEmpty}</p>}
          </div>
        </section>
        <div className="space-y-5">
          <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-[0_2px_16px_rgba(14,15,19,.04)]">
            <h2 className="flex items-center gap-2 font-semibold"><ShoppingBag size={17} className="text-primary" />Produtos mais comprados</h2>
            <div className="mt-3 divide-y divide-border">
              {data.resumoComercial.produtosMaisComprados.map((item, indice) => (
                <div key={item.produtoId} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums text-muted-foreground">
                      {indice + 1}
                    </span>
                    <span className="line-clamp-2 leading-snug" title={item.nome}>{item.nome}</span>
                  </span>
                  <b className="shrink-0 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs tabular-nums text-primary">
                    {item.quantidade} un.
                  </b>
                </div>
              ))}
              {!data.resumoComercial.produtosMaisComprados.length && <p className="py-3 text-sm text-muted-foreground">Nenhum produto comprado ainda.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
