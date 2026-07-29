"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import pagesConfig from "@/config/pages.json";
import {
  actionCriarSegmento, actionExcluirSegmento, actionListarSegmentos, actionListarTagsReferencia,
} from "./segmentos-actions";

const copy = pagesConfig.clientes.segments;

type Segmento = Awaited<ReturnType<typeof actionListarSegmentos>>["data"][number];
type Tag = { id: string; nome: string; cor: string | null };

export function SegmentosPainel() {
  const [aberto, setAberto] = useState(false);
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [nome, setNome] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function carregar() {
    Promise.all([actionListarSegmentos(), actionListarTagsReferencia()])
      .then(([segResult, tagsResult]) => {
        setSegmentos(segResult.data);
        setCanManage(segResult.permissions.canManage);
        setTags(tagsResult);
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
    if (!nome.trim() || tagIds.length === 0) return;
    startTransition(async () => {
      try {
        await actionCriarSegmento(nome.trim(), tagIds);
        setNome("");
        setTagIds([]);
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
                <p className="text-xs text-muted-foreground mb-2">{copy.tagsHint}</p>
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
                          borderColor: item.cor ?? "#64748b",
                          background: tagIds.includes(item.id) ? `${item.cor ?? "#64748b"}30` : "transparent",
                          color: item.cor ?? undefined,
                        }}
                      >
                        {item.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={pending || !nome.trim() || tagIds.length === 0}
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
