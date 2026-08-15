"use client";

import { tint } from "@/shared/design-system/color";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, CircleDot, Info, MapPin, Package, Pencil, Truck, X, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { actionAtualizarCliente } from "../actions";
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
};

const SEGMENTO_COR: Record<string, string> = {
  "Campeão": "var(--success)",
  "Leal": "var(--info)",
  "Em risco": "var(--warning)",
  "Adormecido": "#C2621A",
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
    <div className="px-5 py-3.5 flex items-center gap-3">
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
      {status && <StatusPedidoBadge status={status} />}
      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(date)}</span>
    </div>
  );
}

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
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
    { label: "Complemento", value: c.enderecoComplemento },
    { label: "Bairro", value: c.enderecoBairro },
    { label: "Cidade", value: c.enderecoCidade },
    { label: "Estado", value: c.enderecoEstado },
    { label: "CEP", value: c.enderecoCep },
  ].map((item) => ({ label: item.label, value: item.value?.trim() || null }));
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
    <div className="space-y-6" data-testid="cliente-360">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/clientes")}
          title={copy.actions.back}
          aria-label={copy.actions.back}
          className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] transition-colors hover:bg-muted"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            title={editing ? copy.actions.cancel : copy.actions.edit}
            aria-label={editing ? copy.actions.cancel : copy.actions.edit}
            className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] transition-colors hover:bg-muted"
          >
            {editing ? <X size={17} /> : <Pencil size={17} />}
          </button>
        </div>
      </div>

      <section className="rounded-[1.25rem] border border-border bg-card p-5">
        {editing ? (
          <form action={submit} className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm"><span>{copy.fields.name}</span><input name="nome" required minLength={2} defaultValue={cliente.nome} className="w-full min-h-11 rounded-xl border border-border bg-background px-3" /></label>
            <button disabled={pending} className="md:col-span-2 min-h-11 justify-self-start px-5 rounded-xl text-white font-semibold inline-flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--gradient-signature)" }}>
              <Check size={17} /> {pending ? copy.actions.saving : copy.actions.save}
            </button>
          </form>
        ) : (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-foreground inline-flex items-center gap-2">
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
              <div className="flex flex-wrap gap-2">{data.tags.map((tag) => <span key={tag.id} className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ color: tag.cor ?? undefined, background: tint(tag.cor ?? "#64748b", 12) }}>{tag.nome}</span>)}</div>
            </div>
            <dl className="grid gap-3 mt-5 text-sm">
              <div><dt className="text-muted-foreground">{copy.metrics.orders}</dt><dd className="font-semibold text-lg mt-1">{data.pedidos.length}</dd></div>
            </dl>
            {(() => {
              const partes = partesEndereco(cliente);
              const tudoPendente = partes.every((item) => !item.value);
              return (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">{copy.address.title}</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
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
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-border/60">
                    {tudoPendente ? (
                      <p
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium"
                        style={{ color: "var(--warning)", background: "color-mix(in srgb, #B57A00 10%, transparent)" }}
                      >
                        <Info size={12} strokeWidth={2.25} className="shrink-0" />
                        {copy.address.pendingSubtitle}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Info size={12} strokeWidth={2} className="shrink-0" />
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
                  color: SEGMENTO_COR[data.score.segmento] ?? "#64748b",
                  background: tint(SEGMENTO_COR[data.score.segmento] ?? "#64748b", 12),
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

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
          <h2 className="font-semibold px-5 py-4 border-b border-border">{copy.timelineTitle}</h2>
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
            ]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map(({ key, ...item }) => <TimelineItem key={key} {...item} />)}
            {data.interacoes.length + data.pedidos.length === 0 && <p className="p-5 text-sm text-muted-foreground">{copy.timelineEmpty}</p>}
          </div>
        </section>

      </div>
    </div>
  );
}
