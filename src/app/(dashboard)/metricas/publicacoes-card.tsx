"use client";

import { useEffect, useState } from "react";
import { BarChart3, Eye, ShieldCheck, TriangleAlert } from "lucide-react";
import { actionObterDesempenhoPublicacoes } from "./actions";
import { Card, CardHead } from "@/app/(dashboard)/anuncios/anuncios-primitives";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import type { DesempenhoPublicacoesResultado } from "@/modules/metricas/application/publicacoes.service";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { isBrandSlug } from "@/shared/config/brands";
import { NumeroAnimado } from "./metricas-primitives";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR");

export function PublicacoesCard({ marcas, inicio, fim }: {
  marcas: Array<{ brandId: string; marcaLabel: string; slug: string }>;
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
      <CardHead
        title="Desempenho das publicações"
        icon={BarChart3}
        accent="var(--acento-2)"
        trailing={
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Marca das publicações">
            {marcas.map((marca) => (
              <button key={marca.brandId} type="button" role="tab" aria-selected={brandId === marca.brandId}
                onClick={() => setBrandId(marca.brandId)}
                className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${brandId === marca.brandId ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                {isBrandSlug(marca.slug)
                  ? <BrandLogo brand={marca.slug} height={13} className={brandId === marca.brandId ? "brightness-0 invert" : undefined} />
                  : marca.marcaLabel}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-4 pb-5 pt-4 sm:px-5">
        {carregando ? <Skeleton className="h-52 w-full" /> : !dados || dados.itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma publicação com dados disponível.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {dados.itens.map((item) => (
              <article key={item.itemId} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h4 className="truncate text-sm font-semibold">{item.titulo}</h4><p className="mt-0.5 text-xs text-muted-foreground">{item.itemId}</p></div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold tabular-nums">
                    {item.qualidade === null ? "—" : <><NumeroAnimado valor={item.qualidade} formatar={(v) => inteiro.format(Math.round(v))} />/100</>}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><Eye size={12} /> Visitas</dt><dd className="mt-1 font-semibold tabular-nums"><NumeroAnimado valor={item.visitas} formatar={(v) => inteiro.format(Math.round(v))} /></dd></div>
                  <div><dt className="text-xs text-muted-foreground">Unidades</dt><dd className="mt-1 font-semibold tabular-nums"><NumeroAnimado valor={item.unidadesVendidas} formatar={(v) => inteiro.format(Math.round(v))} /></dd></div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      Conversão
                      {item.conversaoEstimada !== null && (
                        <CalculoPopover
                          titulo="Conversão estimada"
                          formula="unidades vendidas no período, divididas pelas visitas que a publicação recebeu"
                          resultado={`${item.conversaoEstimada.toFixed(2)}%`}
                          itens={[
                            { label: "Unidades vendidas", valor: inteiro.format(item.unidadesVendidas), fracao: item.conversaoEstimada / 100 },
                            { label: "Visitas", valor: inteiro.format(item.visitas) },
                          ]}
                          nota="É uma estimativa: visitas contam a publicação inteira, mas a venda só é atribuída a ela quando o anúncio está vinculado ao catálogo; sem esse vínculo, o cálculo usa as vendas do Mercado Livre como aproximação."
                        />
                      )}
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums">
                      {item.conversaoEstimada === null ? "—" : <NumeroAnimado valor={item.conversaoEstimada} formatar={(v) => `${v.toFixed(2)}%`} />}
                    </dd>
                  </div>
                  <div><dt className="text-xs text-muted-foreground">Receita Ads</dt><dd className="mt-1 font-semibold tabular-nums"><NumeroAnimado valor={item.receita} formatar={(v) => moeda.format(v)} /></dd></div>
                </dl>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck size={13} /> Qualidade: {item.nivelQualidade ?? "indisponível"}</div>
                {item.pendencias.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert size={13} className="mt-0.5 shrink-0" /> {item.pendencias[0]}</p>}
              </article>
            ))}
          </div>
        )}
        {dados?.parcial && <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">Algumas publicações inativas não possuem score de qualidade no Mercado Livre.</p>}
      </div>
    </Card>
  );
}
