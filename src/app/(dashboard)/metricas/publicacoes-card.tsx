"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, ShieldCheck, TriangleAlert } from "lucide-react";
import { actionObterDesempenhoPublicacoes } from "./actions";
import { Card, CardHead } from "./metricas-primitives";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import type { DesempenhoPublicacoesResultado } from "@/modules/metricas/application/publicacoes.service";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { NumeroAnimado } from "./metricas-primitives";
import { inteiro, moeda } from "@/shared/design-system/format";

/** O que o mosaico já buscou ao carregar a página, para a primeira marca (a
 *  aba que abre por padrão). Trocar de aba dentro do card continua buscando
 *  na hora — é uma escolha ativa de quem já está com o card aberto, bem
 *  diferente de esperar só para ver a primeira tela. */
export interface DesempenhoPreCarregado {
  brandId: string;
  inicio: string;
  fim: string;
  dados: DesempenhoPublicacoesResultado | null;
}

export function PublicacoesCard({ marcas, inicio, fim, preCarregado, acaoSlot }: {
  marcas: Array<{ brandId: string; marcaLabel: string; slug: string }>;
  inicio: string;
  fim: string;
  preCarregado?: DesempenhoPreCarregado | null;
  acaoSlot?: HTMLElement | null;
}) {
  const [brandIds, setBrandIds] = useState<string[]>(() => (marcas[0] ? [marcas[0].brandId] : []));
  const [canalAtivo, setCanalAtivo] = useState(true); // único canal com anúncios patrocinados implementado (Mercado Livre)
  const chaveMarca = (id: string) => `${id}:${inicio}:${fim}`;

  const [resultados, setResultados] = useState<Record<string, DesempenhoPublicacoesResultado | null>>(() => {
    const primeira = marcas[0];
    if (primeira && preCarregado && preCarregado.brandId === primeira.brandId && preCarregado.inicio === inicio && preCarregado.fim === fim) {
      return { [chaveMarca(primeira.brandId)]: preCarregado.dados };
    }
    return {};
  });
  const emVoo = useRef(new Set<string>());

  useEffect(() => {
    if (!canalAtivo) return;
    brandIds.forEach((id) => {
      const key = chaveMarca(id);
      if (key in resultados || emVoo.current.has(key)) return;
      emVoo.current.add(key);
      actionObterDesempenhoPublicacoes({ brandId: id, inicio, fim })
        .then((resultado) => setResultados((atual) => ({ ...atual, [key]: resultado })))
        .catch(() => setResultados((atual) => ({ ...atual, [key]: null })))
        .finally(() => emVoo.current.delete(key));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandIds, inicio, fim, canalAtivo]);

  const marcaPorId = new Map(marcas.map((m) => [m.brandId, m]));
  const selecionadas = canalAtivo ? brandIds : [];
  const carregando = selecionadas.length > 0 && selecionadas.some((id) => !(chaveMarca(id) in resultados));
  const itensCombinados = selecionadas.flatMap((id) => {
    const dados = resultados[chaveMarca(id)];
    if (!dados) return [];
    const marca = marcaPorId.get(id);
    return dados.itens.map((item) => ({ item, marca }));
  });
  const algumParcial = selecionadas.some((id) => resultados[chaveMarca(id)]?.parcial);
  const multiplasMarcas = selecionadas.length > 1;

  function alternarMarca(id: string) {
    setBrandIds((atual) => {
      if (atual.includes(id)) {
        const restante = atual.filter((x) => x !== id);
        return restante.length > 0 ? restante : atual; // sempre ao menos uma marca ativa
      }
      return [...atual, id];
    });
  }

  const CANAIS_FUTUROS = [
    { canal: "shopee", label: "Shopee" },
    { canal: "tiktok", label: "TikTok Shop" },
  ] as const;

  const abasCanal = (
    <div className="flex items-center gap-1" role="group" aria-label="Canal das publicações">
      <button type="button" role="switch" aria-checked={canalAtivo}
        title={canalAtivo ? "Anúncios patrocinados do Mercado Livre — clique para ocultar" : "Anúncios patrocinados do Mercado Livre — ocultos, clique para mostrar"}
        onClick={() => setCanalAtivo((v) => !v)}
        style={canalAtivo ? { color: "#8a7000", borderColor: "#8a7000" } : undefined}
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 ${
          canalAtivo ? "border-current shadow-sm" : "border-transparent opacity-40 hover:opacity-70"
        }`}>
        <ChannelLogo canal="mercadolivre" size="sm" variant="logo" />
      </button>
      {CANAIS_FUTUROS.map(({ canal, label }) => (
        <span key={canal} role="switch" aria-checked="false" aria-disabled="true"
          title={`${label} — em breve`}
          className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-full border border-transparent opacity-40">
          <ChannelLogo canal={canal} size="sm" variant="logo" />
        </span>
      ))}
    </div>
  );

  const abasMarca = (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Marcas das publicações">
      {marcas.map((marca) => {
        const ativo = brandIds.includes(marca.brandId);
        const accent = isBrandSlug(marca.slug) ? getBrandConfig(marca.slug)?.color : undefined;
        return (
          <button key={marca.brandId} type="button" role="switch" aria-checked={ativo}
            onClick={() => alternarMarca(marca.brandId)}
            style={ativo ? { color: accent, borderColor: accent ?? "currentColor" } : undefined}
            className={`relative flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all duration-200 ${
              ativo
                ? "border-current shadow-sm"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}>
            {isBrandSlug(marca.slug) ? <BrandLogo brand={marca.slug} height={13} /> : marca.marcaLabel}
          </button>
        );
      })}
    </div>
  );

  const controles = (
    <div className="flex flex-wrap items-center gap-3">
      {abasMarca}
      <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
      {abasCanal}
    </div>
  );

  return (
    <Card>
      <CardHead />
      {acaoSlot && createPortal(controles, acaoSlot)}
      <div className="px-4 pb-5 pt-4 sm:px-5">
        {!canalAtivo ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum canal selecionado.</p>
        ) : carregando ? <Skeleton className="h-52 w-full" /> : itensCombinados.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma publicação com dados disponíveis.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {itensCombinados.map(({ item, marca }) => (
              <article key={`${marca?.brandId ?? ""}:${item.itemId}`} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {multiplasMarcas && marca && (
                      <div className="mb-1 flex items-center gap-1">
                        {isBrandSlug(marca.slug) ? <BrandLogo brand={marca.slug} height={11} /> : (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{marca.marcaLabel}</span>
                        )}
                      </div>
                    )}
                    <h4 className="truncate text-sm font-semibold">{item.titulo}</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.itemId}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold tabular-nums">
                    {item.qualidade === null ? "Sem dado" : <><NumeroAnimado valor={item.qualidade} formatar={(v) => inteiro.format(Math.round(v))} />/100</>}
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
                          significado="Estima quantas visitas à publicação se transformaram em unidades vendidas. Uma taxa maior indica melhor aproveitamento do tráfego recebido."
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
                      {item.conversaoEstimada === null ? "Sem dado" : <NumeroAnimado valor={item.conversaoEstimada} formatar={(v) => `${v.toFixed(2)}%`} />}
                    </dd>
                  </div>
                  <div><dt className="text-xs text-muted-foreground">Receita em anúncios</dt><dd className="mt-1 font-semibold tabular-nums"><NumeroAnimado valor={item.receita} formatar={(v) => moeda.format(v)} /></dd></div>
                </dl>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck size={13} /> Qualidade: {item.nivelQualidade ?? "indisponível"}</div>
                {item.pendencias.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700"><TriangleAlert size={13} className="mt-0.5 shrink-0" /> {item.pendencias[0]}</p>}
              </article>
            ))}
          </div>
        )}
        {algumParcial && <p className="mt-4 text-xs text-amber-700">Algumas publicações inativas não possuem pontuação de qualidade no Mercado Livre.</p>}
      </div>
    </Card>
  );
}
