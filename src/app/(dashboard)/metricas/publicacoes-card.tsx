"use client";

import { useEffect, useState } from "react";
import { BarChart3, Eye, ShieldCheck, TriangleAlert } from "lucide-react";
import { actionObterDesempenhoPublicacoes } from "./actions";
import { Card, CardHead } from "@/app/(dashboard)/anuncios/anuncios-primitives";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import type { DesempenhoPublicacoesResultado } from "@/modules/metricas/application/publicacoes.service";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function PublicacoesCard({ marcas, inicio, fim }: {
  marcas: Array<{ brandId: string; marcaLabel: string }>;
  inicio: string;
  fim: string;
}) {
  const [brandId, setBrandId] = useState(marcas[0]?.brandId ?? "");
  const [consulta, setConsulta] = useState<{ chave: string; dados: DesempenhoPublicacoesResultado | null }>({ chave: "", dados: null });
  const chave = `${brandId}:${inicio}:${fim}`;
  const carregando = consulta.chave !== chave;
  const dados = consulta.dados;

  useEffect(() => {
    if (!brandId) return;
    let ativo = true;
    actionObterDesempenhoPublicacoes({ brandId, inicio, fim })
      .then((resultado) => { if (ativo) setConsulta({ chave, dados: resultado }); })
      .catch(() => { if (ativo) setConsulta({ chave, dados: null }); });
    return () => { ativo = false; };
  }, [brandId, inicio, fim, chave]);

  return (
    <Card>
      <CardHead title="Desempenho das publicações" subtitle="Visitas, conversão e qualidade do anúncio" icon={BarChart3} accent="var(--acento-2)" />
      <div className="px-4 pb-5 sm:px-5">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Marca das publicações">
          {marcas.map((marca) => (
            <button key={marca.brandId} type="button" role="tab" aria-selected={brandId === marca.brandId}
              onClick={() => setBrandId(marca.brandId)}
              className={`min-h-11 rounded-full px-4 text-xs font-semibold ${brandId === marca.brandId ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
              {marca.marcaLabel}
            </button>
          ))}
        </div>
        {carregando ? <Skeleton className="h-52 w-full" /> : !dados || dados.itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma publicação com dados disponível.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {dados.itens.map((item) => (
              <article key={item.itemId} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h4 className="truncate text-sm font-semibold">{item.titulo}</h4><p className="mt-0.5 text-xs text-muted-foreground">{item.itemId}</p></div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold tabular-nums">{item.qualidade === null ? "—" : `${item.qualidade}/100`}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><Eye size={12} /> Visitas</dt><dd className="mt-1 font-semibold tabular-nums">{item.visitas.toLocaleString("pt-BR")}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Unidades</dt><dd className="mt-1 font-semibold tabular-nums">{item.unidadesVendidas.toLocaleString("pt-BR")}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Conversão</dt><dd className="mt-1 font-semibold tabular-nums">{item.conversaoEstimada === null ? "—" : `${item.conversaoEstimada.toFixed(2)}%`}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Receita Ads</dt><dd className="mt-1 font-semibold tabular-nums">{moeda.format(item.receita)}</dd></div>
                </dl>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck size={13} /> Qualidade: {item.nivelQualidade ?? "indisponível"}</div>
                {item.pendencias.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert size={13} className="mt-0.5 shrink-0" /> {item.pendencias[0]}</p>}
              </article>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Conversão = unidades vendidas no período ÷ visitas da publicação. Anúncios ainda não vinculados ao catálogo usam vendas atribuídas como aproximação.</p>
        {dados?.parcial && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Algumas publicações inativas não possuem score de qualidade no Mercado Livre.</p>}
      </div>
    </Card>
  );
}
