"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { springs } from "@/shared/design-system/motion-variants";
import { isBrandSlug } from "@/shared/config/brands";
import metricasConfig from "@/config/metricas.json";
import type { Pilar, SaudeLojaResultado, SaudeMarca } from "@/modules/metricas/application/saude-loja.service";
import { AnelScore, AvisoParcial, BarraComLimite, Card, CardHead } from "./metricas-primitives";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";

const copy = metricasConfig.score;

/** Chave da visão consolidada. Não é um brandId — nenhum uuid colide com isto. */
const CONSOLIDADO = "__consolidado__";

/* ── Seletor de escopo ─────────────────────────────────────────
   Uma fileira só: "Consolidado" + uma pílula por marca. A pastilha
   ativa é um único elemento que desliza (layoutId), então trocar de
   marca é um movimento contínuo — o olho segue de onde saiu para
   onde chegou em vez de reencontrar um estado novo. */
function SeletorEscopo({ marcas, valor, onChange }: {
  marcas: SaudeMarca[];
  valor: string;
  onChange: (valor: string) => void;
}) {
  const opcoes = [
    { chave: CONSOLIDADO, label: copy.consolidado, slug: null as string | null },
    ...marcas.map((marca) => ({ chave: marca.brandId, label: marca.marcaLabel, slug: marca.marca })),
  ];

  return (
    <div className="flex gap-1 overflow-x-auto rounded-[0.9rem] bg-muted p-1 scrollbar-none sm:flex-wrap sm:overflow-visible" role="tablist">
      {opcoes.map((opcao) => {
        const ativo = opcao.chave === valor;
        return (
          <button
            key={opcao.chave}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(opcao.chave)}
            className={`press-feedback relative flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[0.6rem] px-3 text-xs transition-colors ${ativo ? "font-extrabold" : "font-semibold"}`}
            style={{ color: ativo ? "var(--foreground)" : "var(--muted-foreground)" }}
          >
            {ativo && (
              <motion.span
                layoutId="metricas-escopo"
                transition={springs.settleFast}
                className="absolute inset-0 rounded-[0.6rem] border border-border bg-card shadow-[0_2px_6px_rgba(14,15,19,.14)]"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {opcao.slug && isBrandSlug(opcao.slug)
                ? <BrandLogo brand={opcao.slug} height={14} />
                : opcao.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Explicação de cada pilar ─────────────────────────────────
   Dinâmica: usa o peso, a nota e o "detalhe" (frase que já vem calculada
   pro pilar daquela marca naquele período) pra montar um popover que fala
   do pilar em geral e do número específico ao mesmo tempo — não é um texto
   fixo repetido pras 3 marcas, muda com o dado de cada uma. */
function explicacaoPilar(pilar: Pilar) {
  const semDado = pilar.nota === null;
  const resultado = semDado ? "Sem dado" : String(Math.round(pilar.nota as number));

  const SIGNIFICADO: Record<Pilar["chave"], string> = {
    reputacao: "Reputação da marca como vendedora, direto do termômetro público do Mercado Livre (a cor que qualquer comprador vê na página do anúncio), somada ao selo de Mercado Líder quando a marca tem.",
    posVenda: "Quantidade de taxas de problemas no pós-venda, como reclamações, cancelamentos e atrasos no envio, que ultrapassaram o limite considerado saudável no período.",
    satisfacao: "Nota média (1 a 5 estrelas) que os clientes deixaram nos pedidos da marca no período.",
    atendimento: "Velocidade com que a marca respondeu às mensagens de clientes no período. Quanto mais rápida a resposta, melhor o pilar.",
    estoque: "Quantidade de produtos ativos do catálogo que possuem saldo disponível para venda e quantidade dos que já estão abaixo do mínimo configurado.",
  };

  const FORMULA: Record<Pilar["chave"], string> = {
    reputacao: "conversão direta do termômetro de reputação do Mercado Livre para uma escala de 0 a 100",
    posVenda: "parte de 100 e desconta conforme as taxas de reclamação, cancelamento e atraso passam do limite saudável",
    satisfacao: "nota média das avaliações recebidas no período, na mesma escala de 0 a 100",
    atendimento: "mediana do tempo de resposta às mensagens, convertida pra escala de 0 a 100 (resposta rápida pontua mais)",
    estoque: "proporção de produtos ativos com saldo disponível, descontando quem está abaixo do mínimo configurado",
  };

  return {
    titulo: `${pilar.label} · peso ${pilar.peso}`,
    significado: SIGNIFICADO[pilar.chave],
    formula: FORMULA[pilar.chave],
    resultado,
    itens: [{ label: "Nesta marca e período", valor: pilar.detalhe }],
    nota: semDado
      ? "Não há dados neste período. Este pilar sai do cálculo do score, e seu peso é redistribuído entre os pilares que possuem dados."
      : `Peso ${pilar.peso} de 100 na composição do score. Quanto maior o peso, maior a influência deste pilar no resultado final.`,
  };
}

/* ── Linha de pilar ────────────────────────────────────────────
   O peso fica visível ao lado do nome. Sem isso o leitor não tem
   como saber por que o score não subiu quando "Estoque" foi de 40
   para 90 — Estoque vale 10, Reputação vale 30. */
function LinhaPilar({ pilar, indice }: { pilar: Pilar; indice: number }) {
  const semDado = pilar.nota === null;
  const cor = semDado
    ? "var(--muted-foreground)"
    : (pilar.nota as number) >= 70 ? "var(--success)"
    : (pilar.nota as number) >= 50 ? "var(--warning)"
    : "var(--destructive)";

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springs.settleFast, delay: indice * 0.05 }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={`truncate text-[14px] font-semibold ${semDado ? "text-muted-foreground" : "text-foreground"}`}>
            {pilar.label}
          </span>
          <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground/70">
            peso {pilar.peso}
          </span>
          <CalculoPopover compacto {...explicacaoPilar(pilar)} />
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className="text-[17px] font-bold tabular-nums"
            style={{ color: cor }}
          >
            {semDado ? "Sem dado" : Math.round(pilar.nota as number)}
          </span>
        </span>
      </div>
      {/* 8px, não 10 como a barra de marca: são cinco linhas empilhadas aqui
          contra três lá — a mesma altura viraria uma parede de barras. */}
      <BarraComLimite
        valor={pilar.nota ?? 0}
        maximo={100}
        cor={cor}
        altura={8}
        atraso={0.08 + indice * 0.05}
      />
      <p className="text-[11px] leading-snug text-muted-foreground">{pilar.detalhe}</p>
    </motion.li>
  );
}

/* ── Traço do score ────────────────────────────────────────────
   O texto genérico em `copy.explicacao` diz a regra ("média ponderada,
   pilar sem dado sai da conta"); isso aqui mostra a conta de verdade
   daquele número específico — com os pesos já redistribuídos, não os
   pesos "de tabela". */
function PopoverScore({ consolidado, marcas, marcaSelecionada, score }: {
  consolidado: boolean;
  marcas: SaudeMarca[];
  marcaSelecionada: SaudeMarca | null;
  score: number | null;
}) {
  if (score === null) return null;

  if (consolidado) {
    const medidas = marcas.filter((marca) => marca.score !== null);
    const pesoTotal = medidas.reduce((soma, marca) => soma + marca.faturamento, 0);
    const porFaturamento = pesoTotal > 0;
    return (
      <CalculoPopover
        compacto
        titulo="Pontuação consolidada"
        significado="Resume a saúde de todas as marcas em uma nota única de 0 a 100. Marcas com maior faturamento influenciam mais o resultado consolidado."
        formula={porFaturamento
          ? "média das pontuações de cada marca, ponderada pelo faturamento do período"
          : "média simples das pontuações de cada marca (nenhuma faturou no período)"}
        resultado={String(score)}
        itens={medidas.map((marca) => ({
          label: marca.marcaLabel,
          valor: porFaturamento
            ? `${marca.score} · ${Math.round((marca.faturamento / pesoTotal) * 100)}% do peso`
            : String(marca.score),
        }))}
        nota="A marca que fatura mais possui maior peso no retrato do negócio. Não se trata de uma média simples entre marcas."
      />
    );
  }

  if (!marcaSelecionada) return null;
  const medidos = marcaSelecionada.pilares.filter((pilar) => pilar.nota !== null);
  const pesoTotal = medidos.reduce((soma, pilar) => soma + pilar.peso, 0);
  return (
    <CalculoPopover
      compacto
      titulo={`Pontuação, ${marcaSelecionada.marcaLabel}`}
      significado="Resume a saúde desta marca em uma nota de 0 a 100, combinando reputação, pós-venda, satisfação, atendimento e catálogo."
      formula="média ponderada das notas dos pilares medidos, cada uma em uma escala de 0 a 100"
      resultado={String(score)}
      itens={medidos.map((pilar) => ({
        label: pilar.label,
        valor: `${Math.round(pilar.nota as number)} · peso ${Math.round((pilar.peso / pesoTotal) * 100)}%`,
      }))}
      nota={medidos.length < 5
        ? `Somente ${medidos.length} de 5 pilares possuíam dados. O peso dos demais foi redistribuído entre eles.`
        : "Os 5 pilares possuíam dados neste período. Nenhum peso precisou ser redistribuído."}
    />
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6 px-5 pb-5 pt-6 sm:flex-row sm:items-center">
      <Skeleton className="h-[168px] w-[168px] rounded-full" />
      <div className="flex-1 space-y-4">
        {[0, 1, 2, 3, 4].map((linha) => (
          <div key={linha} className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoreCard({ dados, carregando, acaoSlot }: {
  dados: SaudeLojaResultado | null;
  carregando: boolean;
  /** Nó do cabeçalho do Foco onde o botão "Como é calculado" é portado —
   *  ver `BlocoDef.render` em bloco.tsx. */
  acaoSlot?: HTMLElement | null;
}) {
  const [escopo, setEscopo] = useState<string>(CONSOLIDADO);
  const reduzir = useReducedMotion();

  const marcaSelecionada = useMemo(
    () => dados?.marcas.find((marca) => marca.brandId === escopo) ?? null,
    [dados, escopo],
  );

  // Consolidado não tem pilares próprios: ele é o resumo do conjunto. Mostrar
  // pilares "médios" ali seria inventar um número que não existe em lugar
  // nenhum, então a visão consolidada mostra o placar de cada marca.
  const consolidado = escopo === CONSOLIDADO;
  const score = consolidado ? dados?.scoreGeral ?? null : marcaSelecionada?.score ?? null;
  const faixaLabel = consolidado ? dados?.faixaGeralLabel ?? null : marcaSelecionada?.faixaLabel ?? null;
  const cor = consolidado
    ? (dados?.faixaGeralCor ?? "var(--muted-foreground)")
    : (marcaSelecionada?.faixaCor ?? "var(--muted-foreground)");

  // Mesmo padrão de popover-com-motion do resto do módulo (CalculoPopover) —
  // antes este botão abria um acordeão manual (texto fixo, sem motion do
  // Radix), o único lugar do card que fugia do padrão central.
  const botaoComoCalculado = (
    <AnimatedInfoPopover
      trigger={(
        <AnimatedInfoTrigger
          title="Entenda quais dados formam a Pontuação de Saúde da Loja"
          iconSize={13}
          className="press-feedback inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          {/* No mobile, "Entenda a pontuação" ao lado do Período não cabia
              numa linha só — rótulo mais curto aqui, o botão continua com o
              title completo pra quem usa leitor de tela. */}
          <span className="sm:hidden">Pontuação</span>
          <span className="hidden sm:inline">Entenda a pontuação</span>
        </AnimatedInfoTrigger>
      )}
      align="start"
      sideOffset={8}
      collisionPadding={12}
      className="z-[100] w-[min(22rem,calc(100vw-1.5rem))] rounded-[1.1rem] border border-border bg-card p-5 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
    >
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">Como a pontuação funciona</p>
      <p className="mt-2 text-[13px] leading-relaxed text-foreground/85">{copy.explicacao}</p>
    </AnimatedInfoPopover>
  );

  return (
    <Card>
      {/* O ícone/título/subtítulo já vivem no cabeçalho do Foco (bloco.tsx) —
          repeti-los aqui era a "segunda tela" que fazia o painel parecer uma
          página dentro da página. O botão migra pro mesmo cabeçalho via
          portal, em vez de abrir um segundo abaixo dele. CardHead continua
          aqui sem props: é só o respiro do topo do card agora. */}
      <CardHead />
      {acaoSlot && createPortal(botaoComoCalculado, acaoSlot)}

      {carregando && !dados ? (
        <Esqueleto />
      ) : !dados || dados.marcas.length === 0 ? (
        <EmptyState illustration="reports" title={copy.semDado} description={copy.semDadoDescricao} />
      ) : (
        <motion.div animate={{ opacity: carregando ? 0.55 : 1 }} transition={springs.settleFast} className="px-4 pb-5 sm:px-5">
          <div className="mt-4">
            <SeletorEscopo marcas={dados.marcas} valor={escopo} onChange={setEscopo} />
          </div>

          {/* Anel maior e mais respiro entre ele e a lista: no painel de foco
              em tela cheia, o conteúdo antigo ocupava menos da metade da
              altura e sobrava um vazio grande embaixo. */}
          <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:gap-10">
            <div className="flex flex-col items-center gap-2">
              <AnelScore valor={score} cor={cor} faixaLabel={faixaLabel} tamanho={224} />
              {score !== null && (
                <span className="flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground/70">
                  Ver a conta
                  <PopoverScore
                    consolidado={consolidado}
                    marcas={dados.marcas}
                    marcaSelecionada={marcaSelecionada}
                    score={score}
                  />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <AnimatePresence mode="wait" initial={false}>
                {consolidado ? (
                  <motion.ul
                    key="consolidado"
                    initial={reduzir ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduzir ? undefined : { opacity: 0, y: -6 }}
                    transition={springs.settleFast}
                    className="flex flex-col gap-4"
                  >
                    {dados.marcas.map((marca, indice) => (
                      <motion.li
                        key={marca.brandId}
                        layout
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...springs.settleFast, delay: indice * 0.05 }}
                      >
                        <button
                          type="button"
                          onClick={() => setEscopo(marca.brandId)}
                          className="press-feedback flex w-full flex-col gap-2 rounded-[0.9rem] px-2 py-2.5 text-left transition-colors hover:bg-muted"
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              {isBrandSlug(marca.marca)
                                ? <BrandLogo brand={marca.marca} height={17} />
                                : <span className="truncate text-[14px] font-semibold text-foreground">{marca.marcaLabel}</span>}
                              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {marca.faixaLabel ?? "sem dado"}
                              </span>
                            </span>
                            <span
                              className="shrink-0 text-[20px] font-bold tabular-nums"
                              style={{ color: marca.faixaCor ?? "var(--muted-foreground)" }}
                            >
                              {marca.score ?? "Sem dado"}
                            </span>
                          </span>
                          <BarraComLimite
                            valor={marca.score ?? 0}
                            maximo={100}
                            cor={marca.faixaCor ?? "var(--muted-foreground)"}
                            altura={10}
                            atraso={0.1 + indice * 0.05}
                          />
                        </button>
                      </motion.li>
                    ))}
                  </motion.ul>
                ) : (
                  <motion.ul
                    key={escopo}
                    initial={reduzir ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduzir ? undefined : { opacity: 0, y: -6 }}
                    transition={springs.settleFast}
                    className="flex flex-col gap-3.5"
                  >
                    {marcaSelecionada?.pilares.map((pilar, indice) => (
                      <LinhaPilar key={pilar.chave} pilar={pilar} indice={indice} />
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>

              {!consolidado && marcaSelecionada && marcaSelecionada.pilaresMedidos < 5 && (
                <div className="mt-4">
                  <AvisoParcial>
                    <AlertTriangle aria-hidden="true" size={13} className="mt-[1px] shrink-0" />
                    <span>
                      {copy.parcialPrefixo} <strong className="font-semibold text-foreground">{marcaSelecionada.pilaresMedidos}</strong> {copy.parcialSufixo}.
                    </span>
                  </AvisoParcial>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </Card>
  );
}
