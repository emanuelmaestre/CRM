"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { isBrandSlug } from "@/shared/config/brands";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterVisaoGeralAnuncios } from "../actions";
import { Card } from "../anuncios-primitives";
import { Roas } from "../roas";
import type { ClassificacaoDependencia } from "@/modules/anuncios/application/metricas-calculadas";
import type { VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";
import { tint } from "@/shared/design-system/color";

const copy = anunciosConfig.comparacaoDetalhe;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const COR_DEPENDENCIA: Record<ClassificacaoDependencia, string> = {
  baixa: "var(--success)",
  moderada: "var(--warning)",
  alta: "var(--escala-2)",
  critica: "var(--destructive)",
};

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function ComparacaoClienteDetalhe() {
  const [dados, setDados] = useState<VisaoGeralResultado | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    actionObterVisaoGeralAnuncios()
      .then((resultado) => { if (ativo) setDados(resultado); })
      .catch(() => { if (ativo) toast.error(anunciosConfig.erros.carregar); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  if (carregando) return <Esqueleto />;

  if (!dados || dados.marcas.length === 0) {
    return (
      <div className="card-surface">
        <EmptyState illustration="generic" title={anunciosConfig.vazio.titulo} description={anunciosConfig.vazio.descricao} />
      </div>
    );
  }

  if (dados.marcas.length < 2) {
    return (
      <div className="card-surface">
        <EmptyState illustration="generic" title={copy.vazio} />
      </div>
    );
  }

  const marcasOrdenadas = [...dados.marcas].sort((a, b) => b.resumo.investimentoTotal - a.resumo.investimentoTotal);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <Card>
        <div className="divide-y divide-border px-4 py-2 md:hidden">
          {marcasOrdenadas.map((marca) => {
            const lucroPositivo = marca.resumo.lucroTotal >= 0;
            const dependencia = marca.resumo.dependenciaMidia.classificacao;
            return (
              <article key={marca.brandId} className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold text-foreground">{isBrandSlug(marca.brandSlug) ? <BrandLogo brand={marca.brandSlug} height={14} /> : marca.brandLabel}</span>
                  {dependencia && <span className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold" style={{ background: tint(COR_DEPENDENCIA[dependencia], 9), color: COR_DEPENDENCIA[dependencia] }}>{copy.dependencia[dependencia]} · {marca.resumo.dependenciaMidia.percentual?.toFixed(0)}%</span>}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Investimento</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(marca.resumo.investimentoTotal)}</dd></div>
                  <div className="text-right"><dt className="text-xs text-muted-foreground">Receita</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(marca.resumo.receitaTotal)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">ROAS</dt><dd className="mt-0.5 font-semibold"><Roas valor={marca.resumo.roasMedio} /></dd></div>
                  <div className="text-right"><dt className="text-xs text-muted-foreground">Lucro</dt><dd className="mt-0.5 font-semibold tabular-nums" style={{ color: lucroPositivo ? "var(--success)" : "var(--destructive)" }}>{moeda.format(marca.resumo.lucroTotal)}{marca.resumo.lucroIncompleto && "*"}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
        <div className="table-scroll hidden px-1 pb-5 pt-3 md:block sm:px-2">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase text-muted-foreground">
                {copy.colunas.map((coluna: string, indice: number) => (
                  <th key={coluna} className={`px-3 py-2 ${indice > 0 ? "text-right" : ""}`}>{coluna}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {marcasOrdenadas.map((marca, indice) => {
                const lucroPositivo = marca.resumo.lucroTotal >= 0;
                const dependencia = marca.resumo.dependenciaMidia.classificacao;
                return (
                  <tr key={marca.brandId} className={indice < marcasOrdenadas.length - 1 ? "border-b border-border" : ""}>
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      <span className="inline-flex items-center gap-2">
                        {isBrandSlug(marca.brandSlug) ? <BrandLogo brand={marca.brandSlug} height={14} /> : marca.brandLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(marca.resumo.investimentoTotal)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(marca.resumo.receitaTotal)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      <Roas valor={marca.resumo.roasMedio} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {marca.resumo.tacos === null ? "—" : `${marca.resumo.tacos.toFixed(1)}%`}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-semibold tabular-nums"
                      style={{ color: lucroPositivo ? "var(--success)" : "var(--destructive)" }}
                      title={marca.resumo.lucroIncompleto ? "Estimativa parcial — custo do produto não configurado" : undefined}
                    >
                      {moeda.format(marca.resumo.lucroTotal)}{marca.resumo.lucroIncompleto && "*"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {dependencia === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tint(COR_DEPENDENCIA[dependencia], 9), color: COR_DEPENDENCIA[dependencia] }}>
                          {copy.dependencia[dependencia]} · {marca.resumo.dependenciaMidia.percentual?.toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
}
