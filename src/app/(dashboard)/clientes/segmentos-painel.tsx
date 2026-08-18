"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import pagesConfig from "@/config/pages.json";
import { tint } from "@/shared/design-system/color";
import {
  actionCriarSegmento, actionExcluirSegmento, actionListarSegmentos, actionListarTagsReferencia,
} from "./segmentos-actions";
import { actionContarClientesPorCanal, actionContarClientesPorMarca } from "./actions";

const copy = pagesConfig.clientes.segments;

type Segmento = Awaited<ReturnType<typeof actionListarSegmentos>>["data"][number];
type Tag = { id: string; nome: string; cor: string | null };

export function SegmentosPainel() {
  const [aberto, setAberto] = useState(false);
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [marcas, setMarcas] = useState<Awaited<ReturnType<typeof actionContarClientesPorMarca>>>([]);
  const [canais, setCanais] = useState<Awaited<ReturnType<typeof actionContarClientesPorCanal>>>([]);
  const [canManage, setCanManage] = useState(false);
  const [nome, setNome] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [canalTipos, setCanalTipos] = useState<Array<"mercadolivre" | "shopee" | "tiktokshop">>([]);
  const [totalGastoMin, setTotalGastoMin] = useState("");
  const [pedidosMin, setPedidosMin] = useState("");
  const [diasSemComprarMin, setDiasSemComprarMin] = useState("");
  const [pending, startTransition] = useTransition();

  function carregar() {
    Promise.all([actionListarSegmentos(), actionListarTagsReferencia(), actionContarClientesPorMarca(), actionContarClientesPorCanal()])
      .then(([segResult, tagsResult, marcasResult, canaisResult]) => {
        setSegmentos(segResult.data);
        setCanManage(segResult.permissions.canManage);
        setTags(tagsResult);
        setMarcas(marcasResult);
        setCanais(canaisResult);
      })
      .catch(() => toast.error(copy.messages.loadError));
  }

  useEffect(() => {
    if (aberto) carregar();
  }, [aberto]);

  function alternarTag(id: string) {
    setTagIds((atuais) => atuais.includes(id) ? atuais.filter((t) => t !== id) : [...atuais, id]);
  }

  function criar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const temCriterio = tagIds.length > 0 || brandIds.length > 0 || canalTipos.length > 0 || totalGastoMin !== "" || pedidosMin !== "" || diasSemComprarMin !== "";
    if (!nome.trim() || !temCriterio) return;
    startTransition(async () => {
      try {
        await actionCriarSegmento(nome.trim(), {
          tagIds,
          brandIds,
          canalTipos,
          totalGastoMin: totalGastoMin === "" ? undefined : Number(totalGastoMin),
          pedidosMin: pedidosMin === "" ? undefined : Number(pedidosMin),
          diasSemComprarMin: diasSemComprarMin === "" ? undefined : Number(diasSemComprarMin),
        });
        setNome("");
        setTagIds([]);
        setBrandIds([]);
        setCanalTipos([]);
        setTotalGastoMin("");
        setPedidosMin("");
        setDiasSemComprarMin("");
        toast.success(copy.messages.createSuccess);
        carregar();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : copy.messages.createError);
      }
    });
  }

  function excluir(id: string, itemNome: string) {
    if (!confirm(copy.actions.deleteConfirm.replace("{name}", itemNome))) return;
    startTransition(async () => {
      try {
        await actionExcluirSegmento(id);
        toast.success(copy.messages.deleteSuccess);
        carregar();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : copy.messages.deleteError);
      }
    });
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setAberto((value) => !value)}
        className="min-h-11 text-sm font-medium text-primary"
        data-testid="toggle-segmentos"
      >
        {aberto ? copy.toggleHide : copy.toggleShow}
      </button>

      {aberto && (
        <section className="mt-3 rounded-[1.25rem] border border-border bg-card p-5" data-testid="segmentos-painel">
          <h2 className="text-sm font-semibold mb-3">{copy.title}</h2>

          {canManage && (
            <form onSubmit={criar} className="mb-4 space-y-3 rounded-xl border border-border p-4">
              <input
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder={copy.namePlaceholder}
                className="w-full min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Tags (opcional)</p>
                {tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{copy.noTags}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => alternarTag(item.id)}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                        style={{
                          borderColor: item.cor ?? "var(--tag-fallback)",
                          background: tagIds.includes(item.id) ? tint(item.cor ?? "var(--tag-fallback)", 18) : "transparent",
                          color: item.cor ?? undefined,
                        }}
                      >
                        {item.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="mb-2 text-xs text-muted-foreground">Marcas (opcional)</p><div className="flex flex-wrap gap-2">{marcas.map((marca) => <button key={marca.brandId} type="button" onClick={() => setBrandIds((atuais) => atuais.includes(marca.brandId) ? atuais.filter((id) => id !== marca.brandId) : [...atuais, marca.brandId])} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${brandIds.includes(marca.brandId) ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{marca.name}</button>)}</div></div>
                <div><p className="mb-2 text-xs text-muted-foreground">Canais (opcional)</p><div className="flex flex-wrap gap-2">{canais.filter((canal) => canal.conectado).map((canal) => <button key={canal.tipo} type="button" onClick={() => setCanalTipos((atuais) => atuais.includes(canal.tipo) ? atuais.filter((tipo) => tipo !== canal.tipo) : [...atuais, canal.tipo])} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${canalTipos.includes(canal.tipo) ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{canal.tipo}</button>)}</div></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-xs text-muted-foreground">Total comprado mínimo
                  <input type="number" min="0" step="0.01" value={totalGastoMin} onChange={(e) => setTotalGastoMin(e.target.value)} placeholder="R$ 0,00" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">Quantidade mínima de pedidos
                  <input type="number" min="0" step="1" value={pedidosMin} onChange={(e) => setPedidosMin(e.target.value)} placeholder="0" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">Sem comprar há pelo menos
                  <div className="relative mt-1"><input type="number" min="0" step="1" value={diasSemComprarMin} onChange={(e) => setDiasSemComprarMin(e.target.value)} placeholder="Dias" className="h-11 w-full rounded-xl border border-border bg-background px-3 pr-12 text-sm text-foreground" /><span className="absolute right-3 top-3 text-xs">dias</span></div>
                </label>
              </div>
              <button
                type="submit"
                disabled={pending || !nome.trim() || (tagIds.length === 0 && brandIds.length === 0 && canalTipos.length === 0 && totalGastoMin === "" && pedidosMin === "" && diasSemComprarMin === "")}
                className="min-h-11 px-4 rounded-xl bg-foreground text-sm font-semibold text-background disabled:opacity-50"
              >
                {pending ? copy.actions.creating : copy.actions.create}
              </button>
            </form>
          )}

          <div className="divide-y divide-border">
            {segmentos.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{item.nome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{copy.clientsCount.replace("{count}", String(item.totalClientes))}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[
                      item.filtros.tagIds?.length ? `${item.filtros.tagIds.length} tag(s)` : null,
                      item.filtros.brandIds?.length ? `${item.filtros.brandIds.length} marca(s)` : null,
                      item.filtros.canalTipos?.length ? item.filtros.canalTipos.join(", ") : null,
                      item.filtros.totalGastoMin != null ? `mín. R$ ${Number(item.filtros.totalGastoMin).toLocaleString("pt-BR")}` : null,
                      item.filtros.pedidosMin != null ? `mín. ${item.filtros.pedidosMin} pedido(s)` : null,
                      item.filtros.diasSemComprarMin != null ? `${item.filtros.diasSemComprarMin}+ dias sem comprar` : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => excluir(item.id, item.nome)}
                    className="min-h-11 text-xs text-muted-foreground hover:text-destructive"
                  >
                    {copy.actions.delete}
                  </button>
                )}
              </div>
            ))}
            {segmentos.length === 0 && <p className="py-3 text-sm text-muted-foreground">{copy.empty}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
