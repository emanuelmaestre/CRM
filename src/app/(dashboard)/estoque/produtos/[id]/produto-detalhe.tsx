"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Boxes, Car, Check, Layers, Link2, Pencil, Ruler, X } from "lucide-react";
import { actionEditarProduto } from "../../actions";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig } from "@/shared/config/brands";
import { analisarTituloProduto } from "@/shared/lib/produto-titulo";
import pagesConfig from "@/config/pages.json";

const editCopy = pagesConfig.estoque.edit;
const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type ProdutoData = {
  produto: {
    id: string; sku: string; nome: string; preco: string;
    estoqueMinimo: number; brandSlug: string; brandName: string;
  };
  saldo: number;
  canais: Array<{ id: string; externalListingId: string; externalSkuId?: string | null; ativo: boolean; canalTipo: string; saldo: number | null; verificadoEm: Date | string | null }>;
};

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function canalLabel(canal: string) {
  const items = channelsConfig.items as Record<string, { label: string }>;
  return items[canal]?.label ?? canal;
}

function brandColor(slug: string) {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

export function ProdutoDetalhe({ initialData, canManage }: { initialData: ProdutoData; canManage: boolean }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();
  const p = data.produto;

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const nome = formData.get("nome") as string;
        const preco = formData.get("preco") as string;
        const atualizado = await actionEditarProduto(p.id, nome, preco);
        setData((atual) => ({ ...atual, produto: { ...atual.produto, ...atualizado } }));
        setEditando(false);
        toast.success(editCopy.success);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : editCopy.error);
      }
    });
  }

  return (
    <div className="space-y-6" data-testid="produto-detalhe">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/estoque")}
          title="Voltar ao estoque"
          aria-label="Voltar ao estoque"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] transition-colors hover:bg-muted"
        >
          <ArrowLeft size={17} />
        </button>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              title={editando ? editCopy.cancel : editCopy.button}
              aria-label={editando ? editCopy.cancel : editCopy.button}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] transition-colors hover:bg-muted"
            >
              {editando ? <X size={17} /> : <Pencil size={16} />}
            </button>
          </div>
        )}
      </div>

      <section className="rounded-[1.25rem] border border-border bg-card p-5">
        {editando ? (
          <form action={submit} className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm md:col-span-2">
              <span>{editCopy.fields.name}</span>
              <input name="nome" required minLength={2} defaultValue={p.nome} className="w-full min-h-11 rounded-xl border border-border bg-background px-3" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span>{editCopy.fields.price}</span>
              <input name="preco" type="number" step="0.01" min="0.01" required defaultValue={p.preco} className="w-full min-h-11 rounded-xl border border-border bg-background px-3" />
            </label>
            <p className="text-[11px] text-muted-foreground md:col-span-2">{editCopy.syncHint}</p>
            <button disabled={pending} className="md:col-span-2 min-h-11 justify-self-start px-5 rounded-xl text-white font-semibold inline-flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--gradient-signature)" }}>
              <Check size={17} /> {pending ? editCopy.submitting : editCopy.submit}
            </button>
          </form>
        ) : (
          <div>
            {(() => {
              const titulo = analisarTituloProduto(p.nome);
              if (!titulo.separado) {
                return <h1 className="text-2xl font-bold text-foreground">{titulo.produto}</h1>;
              }
              return (
                <div>
                  <h1 className="text-2xl font-bold text-foreground">{titulo.produto}</h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    {titulo.tamanho && (
                      <div className="inline-flex items-center gap-2 rounded-[0.75rem] border border-border bg-muted/50 pl-2.5 pr-3 py-1.5">
                        <Ruler size={13} className="text-muted-foreground shrink-0" />
                        <div className="leading-none">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tamanho</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">{titulo.tamanho}</p>
                        </div>
                      </div>
                    )}
                    <div className="inline-flex items-center gap-2 rounded-[0.75rem] border border-border bg-muted/50 pl-2.5 pr-3 py-1.5">
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 rounded-full border border-border/60 shadow-inner"
                        style={{ background: titulo.corHex }}
                      />
                      <div className="leading-none">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cor</p>
                        <p className="text-sm font-bold text-foreground mt-0.5">{titulo.cor}</p>
                      </div>
                    </div>
                    {titulo.material && (
                      <div className="inline-flex items-center gap-2 rounded-[0.75rem] border border-border bg-muted/50 pl-2.5 pr-3 py-1.5">
                        <Layers size={13} className="text-muted-foreground shrink-0" />
                        <div className="leading-none">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Material</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">{titulo.material}</p>
                        </div>
                      </div>
                    )}
                    {titulo.medida && (
                      <div className="inline-flex items-center gap-2 rounded-[0.75rem] border border-border bg-muted/50 pl-2.5 pr-3 py-1.5">
                        <Boxes size={13} className="text-muted-foreground shrink-0" />
                        <div className="leading-none">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Medida</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">{titulo.medida}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {titulo.compatibilidade && titulo.compatibilidade.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Car size={12} /> Compatível com:
                      </span>
                      {titulo.compatibilidade.map((marca, i) => (
                        <span key={i} className="text-[11px] font-medium text-muted-foreground bg-muted/70 rounded px-1.5 py-0.5">
                          {marca}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="font-mono text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">SKU: {p.sku}</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                Empresa: <span className="font-semibold" style={{ color: brandColor(p.brandSlug) }}>{p.brandName}</span>
              </span>
              {data.canais.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  Canal:
                  {data.canais.map((c) => (
                    <ChannelLogo key={c.id} canal={c.canalTipo} size="xs" variant="pill" />
                  ))}
                </span>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-4 sm:max-w-lg mt-5 text-sm">
              <div>
                <dt className="text-muted-foreground">Saldo</dt>
                <dd className="font-semibold text-lg mt-1 tabular-nums">{data.saldo}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{editCopy.fields.minStock}</dt>
                <dd className="font-semibold text-lg mt-1 tabular-nums">{p.estoqueMinimo || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{editCopy.fields.price}</dt>
                <dd className="font-semibold text-lg mt-1">{dinheiro.format(Number(p.preco))}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
          <h2 className="font-semibold px-5 py-4 border-b border-border">Estoque por canal</h2>
          <div className="divide-y divide-border">
            {data.canais.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Produto ainda não está anunciado em nenhum canal.</p>
            ) : (
              data.canais.map((c) => (
                <div key={c.id} className="px-5 py-3.5 flex items-center gap-3">
                  <ChannelLogo canal={c.canalTipo} size="xs" variant="logo" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{canalLabel(c.canalTipo)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.externalListingId}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{c.saldo ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.verificadoEm ? formatDate(c.verificadoEm) : "nunca lido"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold">Canais vinculados</h2>
          </div>
          <div className="divide-y divide-border">
            {data.canais.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground flex items-center gap-2">
                <Link2 size={14} className="shrink-0" /> Nenhum canal vinculado ainda.
              </p>
            ) : (
              data.canais.map((c) => (
                <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                  <ChannelLogo canal={c.canalTipo} size="xs" variant="logo" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      <span className="text-xs font-normal text-muted-foreground">ID do anúncio:</span> {c.externalListingId}
                    </p>
                    {c.externalSkuId && <p className="text-xs text-muted-foreground mt-0.5 truncate">SKU do canal: {c.externalSkuId}</p>}
                  </div>
                  {!c.ativo && <span className="text-[11px] text-muted-foreground shrink-0">Inativo</span>}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

    </div>
  );
}
