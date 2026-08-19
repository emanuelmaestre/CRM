"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { Eye, Package, TrendingUp, Wallet, Gauge, ShieldCheck, TriangleAlert, Megaphone, LayoutGrid } from "lucide-react";
import { actionObterDesempenhoPublicacoes } from "./actions";
import { Card, CardHead, AvisoParcial } from "./metricas-primitives";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import type { DesempenhoPublicacoesResultado } from "@/modules/metricas/application/publicacoes.service";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { NumeroAnimado } from "./metricas-primitives";
import { inteiro, moeda } from "@/shared/design-system/format";
import { springs, staggerExagerado, entradaExagerada, variantes } from "@/shared/design-system/motion-variants";

const formatarDataCurta = (iso: string) => {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
};
const periodoLabel = (inicio: string, fim: string) => `${formatarDataCurta(inicio)} a ${formatarDataCurta(fim)}`;

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
      <motion.button type="button" role="switch" aria-checked={canalAtivo}
        title={canalAtivo ? "Anúncios patrocinados do Mercado Livre — clique para ocultar" : "Anúncios patrocinados do Mercado Livre — ocultos, clique para mostrar"}
        onClick={() => setCanalAtivo((v) => !v)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.88, rotate: -4 }}
        transition={springs.settleFast}
        style={canalAtivo ? { color: "#8a7000", borderColor: "#8a7000" } : undefined}
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-200 ${
          canalAtivo ? "border-current shadow-sm" : "border-transparent opacity-40 hover:opacity-70"
        }`}>
        <ChannelLogo canal="mercadolivre" size="sm" variant="logo" />
      </motion.button>
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
          <motion.button key={marca.brandId} type="button" role="switch" aria-checked={ativo}
            onClick={() => alternarMarca(marca.brandId)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.9 }}
            transition={springs.settleFast}
            style={ativo ? { color: accent, borderColor: accent ?? "currentColor" } : undefined}
            className={`relative flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors duration-200 ${
              ativo
                ? "border-current shadow-sm"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}>
            {isBrandSlug(marca.slug) ? <BrandLogo brand={marca.slug} height={13} /> : marca.marcaLabel}
          </motion.button>
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

  const reduzir = useReducedMotion();
  const periodo = periodoLabel(inicio, fim);

  return (
    <Card>
      <CardHead />
      {acaoSlot && createPortal(controles, acaoSlot)}
      <div className="px-4 pb-5 pt-4 sm:px-5">
        <AnimatePresence mode="wait">
          {!canalAtivo ? (
            <EstadoVazio key="sem-canal" icone={Megaphone} texto="Nenhum canal selecionado. Ative o Mercado Livre acima para ver as publicações." />
          ) : carregando ? (
            <motion.div key="carregando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Skeleton className="h-52 w-full" />
            </motion.div>
          ) : itensCombinados.length === 0 ? (
            <EstadoVazio key="sem-dados" icone={LayoutGrid} texto="Nenhuma publicação com dados disponíveis para o filtro atual." />
          ) : (
            <motion.div key="lista">
              {/* Resumo dinâmico do que está sendo exibido — traduz a combinação de
                  abas ativas (marcas × canal) numa frase, em vez de deixar quem olha
                  reconstruir isso de cabeça a partir das abas marcadas lá em cima. */}
              <motion.p
                initial={reduzir ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springs.settleFast}
                className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span className="font-semibold text-foreground">{itensCombinados.length}</span>
                {itensCombinados.length === 1 ? "publicação" : "publicações"} de Product Ads
                {multiplasMarcas ? ` em ${selecionadas.length} marcas` : ""} · {periodo}
              </motion.p>

              <motion.div
                variants={variantes(reduzir, staggerExagerado)}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-3 lg:grid-cols-2"
              >
                {itensCombinados.map(({ item, marca }) => {
                  const roas = item.investimento > 0 ? item.receita / item.investimento : null;
                  return (
                    <motion.article
                      key={`${marca?.brandId ?? ""}:${item.itemId}`}
                      layout
                      variants={variantes(reduzir, entradaExagerada)}
                      whileHover={reduzir ? undefined : { y: -4, scale: 1.012 }}
                      transition={springs.settle}
                      className="rounded-xl border border-border p-4 shadow-[0_1px_2px_rgba(14,15,19,.03)] transition-shadow hover:shadow-[0_10px_28px_rgba(14,15,19,.08)]"
                    >
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
                        <div className="flex shrink-0 items-center gap-0.5">
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold tabular-nums">
                            {item.qualidade === null ? "Sem dado" : <><NumeroAnimado valor={item.qualidade} formatar={(v) => inteiro.format(Math.round(v))} />/100</>}
                          </span>
                          <CalculoPopover
                            compacto
                            titulo="Pontuação de qualidade"
                            significado="Nota de 0 a 100 que o Mercado Livre dá à publicação, com base em quão completa e atrativa ela está (fotos, ficha técnica, título, garantia)."
                            formula="calculada pelo Mercado Livre a partir dos atributos preenchidos no anúncio — não é um valor que o CRM calcula."
                            resultado={item.qualidade === null ? "Sem dado" : `${Math.round(item.qualidade)}/100`}
                            itens={[
                              { label: "Nível", valor: item.nivelQualidade ?? "indisponível" },
                              { label: "Pendências abertas", valor: String(item.pendencias.length) },
                            ]}
                            nota={item.qualidade === null ? "Este anúncio ainda não recebeu score do Mercado Livre — comum em publicações recém-criadas ou inativas." : undefined}
                          />
                        </div>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm sm:grid-cols-5">
                        <div>
                          <dt className="flex items-center gap-1 text-xs text-muted-foreground"><Eye size={12} /> Visitas
                            <CalculoPopover
                              compacto
                              titulo="Visitas"
                              significado="Quantas vezes esta publicação foi vista no Mercado Livre durante o período selecionado — a base de tráfego a partir da qual vêm as vendas."
                              formula="soma das visualizações da publicação, registradas dia a dia pelo Mercado Livre, no período."
                              resultado={inteiro.format(item.visitas)}
                              itens={[{ label: "Visitas no período", valor: inteiro.format(item.visitas) }]}
                              periodoLabel={periodo}
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums"><NumeroAnimado valor={item.visitas} formatar={(v) => inteiro.format(Math.round(v))} /></dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 text-xs text-muted-foreground"><Package size={12} /> Unidades
                            <CalculoPopover
                              compacto
                              titulo="Unidades vendidas"
                              significado="Quantidade de unidades desta publicação vendidas no período, sem contar pedidos cancelados ou devolvidos."
                              formula="soma da quantidade vendida do produto vinculado a este anúncio, cruzando os pedidos internos com o item do Mercado Livre."
                              resultado={inteiro.format(item.unidadesVendidas)}
                              itens={[{ label: "Unidades vendidas", valor: inteiro.format(item.unidadesVendidas) }]}
                              periodoLabel={periodo}
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums"><NumeroAnimado valor={item.unidadesVendidas} formatar={(v) => inteiro.format(Math.round(v))} /></dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp size={12} /> Conversão
                            <CalculoPopover
                              compacto
                              titulo="Conversão estimada"
                              significado="Estima quantas visitas à publicação se transformaram em unidades vendidas. Uma taxa maior indica melhor aproveitamento do tráfego recebido."
                              formula="unidades vendidas no período, divididas pelas visitas que a publicação recebeu"
                              resultado={item.conversaoEstimada === null ? "Sem dado" : `${item.conversaoEstimada.toFixed(2)}%`}
                              itens={[
                                { label: "Unidades vendidas", valor: inteiro.format(item.unidadesVendidas), fracao: item.conversaoEstimada === null ? undefined : item.conversaoEstimada / 100 },
                                { label: "Visitas", valor: inteiro.format(item.visitas) },
                              ]}
                              periodoLabel={periodo}
                              nota={item.conversaoEstimada === null ? "Sem visitas registradas no período para calcular a conversão." : "É uma estimativa: visitas contam a publicação inteira, mas a venda só é atribuída a ela quando o anúncio está vinculado ao catálogo; sem esse vínculo, o cálculo usa as vendas do Mercado Livre como aproximação."}
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums">
                            {item.conversaoEstimada === null ? "Sem dado" : <NumeroAnimado valor={item.conversaoEstimada} formatar={(v) => `${v.toFixed(2)}%`} />}
                          </dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 text-xs text-muted-foreground"><Wallet size={12} /> Receita
                            <CalculoPopover
                              compacto
                              titulo="Receita em anúncios"
                              significado="Valor faturado que o Mercado Livre atribui a esta publicação através do investimento em Product Ads, no período."
                              formula="total de vendas que o Mercado Livre associa a este anúncio patrocinado, no snapshot mais recente do período."
                              resultado={moeda.format(item.receita)}
                              itens={[
                                { label: "Receita atribuída", valor: moeda.format(item.receita) },
                                { label: "Investido em anúncio", valor: moeda.format(item.investimento) },
                              ]}
                              periodoLabel={periodo}
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums"><NumeroAnimado valor={item.receita} formatar={(v) => moeda.format(v)} /></dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 text-xs text-muted-foreground"><Gauge size={12} /> Retorno
                            <CalculoPopover
                              compacto
                              titulo="Retorno sobre o investimento"
                              significado="Quantas vezes o valor investido em Product Ads voltou em receita — o indicador mais direto de se vale a pena manter o investimento neste anúncio."
                              formula="receita atribuída ao anúncio, dividida pelo valor investido nele no período"
                              resultado={roas === null ? "Sem dado" : `${roas.toFixed(1)}x`}
                              itens={[
                                { label: "Receita atribuída", valor: moeda.format(item.receita), fracao: roas === null ? undefined : Math.min(roas / 10, 1) },
                                { label: "Investido em anúncio", valor: moeda.format(item.investimento) },
                              ]}
                              periodoLabel={periodo}
                              nota={roas === null ? "Sem investimento registrado em Product Ads para este anúncio no período — por isso não há retorno a calcular." : "Acima de 1x o anúncio já se pagou; quanto maior, melhor o retorno do investimento."}
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums">{roas === null ? "Sem dado" : `${roas.toFixed(1)}x`}</dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck size={13} /> Qualidade: {item.nivelQualidade ?? "indisponível"}
                        <CalculoPopover
                          compacto
                          titulo="Nível de qualidade"
                          significado="Faixa (cor/palavra) que o Mercado Livre atribui à publicação a partir da mesma pontuação de 0 a 100 mostrada no topo do card — é a leitura resumida daquele número."
                          formula="definida pelo Mercado Livre a partir de faixas fixas de pontuação — não é um valor que o CRM calcula."
                          resultado={item.nivelQualidade ?? "indisponível"}
                          itens={[
                            { label: "Pontuação", valor: item.qualidade === null ? "Sem dado" : `${Math.round(item.qualidade)}/100` },
                            { label: "Pendências abertas", valor: String(item.pendencias.length) },
                          ]}
                          nota={item.nivelQualidade === null ? "Este anúncio ainda não recebeu um nível do Mercado Livre — comum em publicações recém-criadas ou inativas." : undefined}
                        />
                      </div>
                      {item.pendencias.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700"><TriangleAlert size={13} className="mt-0.5 shrink-0" /> {item.pendencias[0]}</p>}
                    </motion.article>
                  );
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {algumParcial && (
          <div className="mt-4">
            <AvisoParcial>
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600" />
              Algumas publicações inativas não possuem pontuação de qualidade no Mercado Livre.
            </AvisoParcial>
          </div>
        )}
      </div>
    </Card>
  );
}

function EstadoVazio({ icone: Icone, texto }: { icone: typeof Megaphone; texto: string }) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduzir ? undefined : { opacity: 0, scale: 0.98 }}
      transition={springs.settle}
      className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground"
    >
      <Icone size={28} className="text-muted-foreground/50" />
      <p className="max-w-xs">{texto}</p>
    </motion.div>
  );
}
