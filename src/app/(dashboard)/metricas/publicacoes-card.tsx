"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { BadgeDollarSign, Eye, Gauge, LayoutGrid, Megaphone, MousePointerClick, Package, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { actionObterDesempenhoPublicacoes } from "./actions";
import { Card, CardHead, AvisoParcial } from "./metricas-primitives";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { PublicidadeIllustration } from "@/shared/design-system/primitives/illustrations";
import type { DesempenhoPublicacoesResultado, SituacaoQualidade } from "@/modules/metricas/application/publicacoes.service";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { traduzirNivelQualidade, traduzirPendenciaPublicacao } from "@/shared/lib/pt-br";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { inteiro, moeda } from "@/shared/design-system/format";
import { springs, staggerExagerado, entradaExagerada, variantes } from "@/shared/design-system/motion-variants";

const formatarDataCurta = (iso: string) => {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
};
const periodoLabel = (inicio: string, fim: string) => `${formatarDataCurta(inicio)} a ${formatarDataCurta(fim)}`;

// dataCriacao vem como ISO completo (com hora e fuso) da API de Itens, não
// no formato "YYYY-MM-DD" de inicio/fim — formatarDataCurta quebraria nele.
const formatarDataPublicacao = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

// A nota de qualidade era sempre cinza neutro, tivesse 5/100 ou 95/100 — sem
// nenhuma pista de cor pra escanear rápido quais publicações precisam de
// atenção antes de ler o número.
function corQualidade(qualidade: number | null): string {
  if (qualidade === null) return "var(--muted-foreground)";
  if (qualidade < 40) return "var(--destructive)";
  if (qualidade < 70) return "var(--warning)";
  return "var(--success)";
}

/** Mesmo halo de pulso usado nas pílulas de marca/canal em Avaliações,
 *  Estoque, Vendas, Clientes e Métricas — duplicado aqui (não importado)
 *  porque cada módulo cuida do próprio filtro, mas o visual segue igual:
 *  borda de 2px + halo pulsando na cor de identidade quando selecionado. */
function HaloSelecao({ cor }: { cor: string }) {
  const reduzir = useReducedMotion();
  return (
    <AnimatePresence>
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: `0 0 0 1px ${cor}` }}
        initial={{ opacity: 0, scale: 1 }}
        animate={reduzir ? { opacity: 0.35 } : { opacity: [0.35, 0, 0.35], scale: [1, 1.18, 1] }}
        transition={reduzir ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </AnimatePresence>
  );
}

function rotuloStatus(status: string | null): string {
  if (status === "active") return "Ativo";
  if (status === "hold") return "Em espera";
  if (status === "idle") return "Sem veiculação";
  return "Status indisponível";
}

/** "Não aplicável" e "Indisponível" pareciam a mesma coisa sem explicação —
 *  o primeiro é o Mercado Livre recusando calcular a pontuação (HTTP 400,
 *  quase sempre porque o status não é "Ativo"); o segundo é uma falha
 *  temporária de consulta, nada a ver com o status do anúncio. Cruza com o
 *  status real (já mostrado no selo ao lado) em vez de um "geralmente"
 *  vago que não confirma nada. */
function motivoQualidadeIndisponivel(status: string | null, qualidadeStatus: SituacaoQualidade): string {
  if (qualidadeStatus === "nao_aplicavel") {
    return status !== "active"
      ? `O Mercado Livre só calcula essa pontuação para anúncios com status "Ativo". Esta publicação está "${rotuloStatus(status)}", por isso a pontuação não existe agora. Não é uma falha nem uma nota zero.`
      : "O Mercado Livre não disponibilizou a pontuação para esta publicação mesmo estando ativa. Pode ser uma restrição pontual da conta ou do item.";
  }
  return "Não foi possível consultar a pontuação agora (falha temporária). Diferente de \"Não aplicável\", aqui o Mercado Livre calcula a nota normalmente, só não respondeu desta vez.";
}

/** Mesma cor por status usada na legenda do "Entenda os status" — o selo
 *  por publicação precisa se destacar tanto quanto o de qualidade ao lado
 *  dele, não sumir como texto cinza corrido junto do ID do anúncio. */
function corStatus(status: string | null): string {
  if (status === "active") return "var(--success)";
  if (status === "hold") return "var(--warning)";
  return "var(--muted-foreground)";
}

/** Mesmo catálogo fixo usado nos outros cards (Estoque Parado, Repor em
 *  breve, Vendem mais, Giro baixo) — aqui são só 3 estados possíveis, os
 *  mesmos que a API de Product Ads do Mercado Livre devolve por publicação. */
const LEGENDA_STATUS_PUBLICACOES: Array<{ titulo: string; texto: string; cor: string }> = [
  { titulo: "Ativo", cor: "var(--success)", texto: "Elegível para veicular anúncios patrocinados agora. Não é garantia de impressões, só significa que nada está bloqueando a exibição." },
  { titulo: "Em espera", cor: "var(--warning)", texto: "Alguma pausa ou restrição está impedindo a veiculação no momento, definida pelo Mercado Livre ou por você." },
  { titulo: "Sem veiculação", cor: "var(--muted-foreground)", texto: "O anúncio não está entregando publicidade agora. Diferente de \"sem veiculação no período\": este é o status atual, não o resultado do intervalo escolhido no calendário." },
];

function EntendaStatusPublicacaoBotao() {
  return (
    <AnimatedInfoPopover
      trigger={(
        <AnimatedInfoTrigger
          title="Entenda os status da publicação no Mercado Livre"
          iconSize={13}
          className="press-feedback inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          Entenda os status
        </AnimatedInfoTrigger>
      )}
      align="end"
      sideOffset={8}
      collisionPadding={12}
      className="z-[100] w-[min(22rem,calc(100vw-1.5rem))] rounded-[1.1rem] border border-border bg-card p-5 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
    >
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">Status da publicação</p>
      <dl className="mt-3 flex flex-col gap-3">
        {LEGENDA_STATUS_PUBLICACOES.map((item) => (
          <div key={item.titulo}>
            <dt className="text-[12.5px] font-bold" style={{ color: item.cor }}>{item.titulo}</dt>
            <dd className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{item.texto}</dd>
          </div>
        ))}
      </dl>
    </AnimatedInfoPopover>
  );
}

export function PublicacoesCard({ marcas, inicio, fim, acaoSlot }: {
  marcas: Array<{ brandId: string; marcaLabel: string; slug: string }>;
  inicio: string;
  fim: string;
  acaoSlot?: HTMLElement | null;
}) {
  // Começa sem marca marcada — igual aos demais cards do mosaico, que
  // esperam uma escolha em vez de assumir a primeira marca da lista.
  const [brandIds, setBrandIds] = useState<string[]>([]);
  // Começa sem canal marcado também — mesmo raciocínio do brandIds acima,
  // nada vem pré-selecionado.
  const [canalAtivo, setCanalAtivo] = useState(false);
  const [mostrarSemVeiculacao, setMostrarSemVeiculacao] = useState(false);
  const chaveMarca = (id: string) => `${id}:${inicio}:${fim}`;

  const [resultados, setResultados] = useState<Record<string, DesempenhoPublicacoesResultado | null>>({});
  const emVoo = useRef(new Set<string>());

  useEffect(() => {
    if (!canalAtivo) return;
    brandIds.forEach((id) => {
      const key = chaveMarca(id);
      if (key in resultados || emVoo.current.has(key)) return;
      emVoo.current.add(key);
      const filtros = { brandId: id, inicio, fim };
      actionObterDesempenhoPublicacoes({ ...filtros, detalhes: false })
        .then((resultado) => {
          setResultados((atual) => ({ ...atual, [key]: resultado }));
          actionObterDesempenhoPublicacoes({ ...filtros, detalhes: true })
            .then((completo) => setResultados((atual) => ({ ...atual, [key]: completo })))
            .catch(() => { /* Mantém as métricas principais já carregadas. */ })
            .finally(() => emVoo.current.delete(key));
        })
        .catch(() => {
          setResultados((atual) => ({ ...atual, [key]: null }));
          emVoo.current.delete(key);
        });
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
  const itensSemVeiculacao = selecionadas.flatMap((id) => {
    const dados = resultados[chaveMarca(id)];
    if (!dados) return [];
    const marca = marcaPorId.get(id);
    return dados.semVeiculacao.map((item) => ({ item, marca }));
  });
  const resumos = selecionadas.flatMap((id) => {
    const dados = resultados[chaveMarca(id)];
    return dados ? [dados.resumo] : [];
  });
  const algumParcial = selecionadas.some((id) => resultados[chaveMarca(id)]?.parcial);
  // null só acontece pelo .catch da busca (a service nunca retorna null em
  // sucesso) — sem essa checagem, "deu erro" e "não tem publicação" caíam
  // na mesma tela de vazio, e quem via não sabia se devia tentar de novo.
  const algumErro = selecionadas.some((id) => chaveMarca(id) in resultados && resultados[chaveMarca(id)] === null);
  const multiplasMarcas = selecionadas.length > 1;
  const totalPublicacoes = resumos.reduce((soma, item) => soma + item.totalPublicacoes, 0);
  const totalComVeiculacao = resumos.reduce((soma, item) => soma + item.comVeiculacao, 0);
  const totalSemVeiculacao = resumos.reduce((soma, item) => soma + item.semVeiculacao, 0);
  const investimentoTotal = resumos.reduce((soma, item) => soma + item.investimento, 0);
  const receitaTotal = resumos.reduce((soma, item) => soma + item.receita, 0);
  const retornoMedio = investimentoTotal > 0 ? receitaTotal / investimentoTotal : null;
  const contagensSelecionadas = brandIds.flatMap((brandId) => {
    const dados = resultados[chaveMarca(brandId)];
    return dados ? [dados.resumo.totalPublicacoes] : [];
  });
  // O contador do canal representa somente as marcas escolhidas. Exibir a
  // soma parcial das marcas já consultadas pareceria um total geral incorreto.
  const totalPublicacoesGeral = brandIds.length > 0 && contagensSelecionadas.length === brandIds.length
    ? contagensSelecionadas.reduce((soma, valor) => soma + valor, 0)
    : null;
  const algumaContagemFalhou = brandIds.some((brandId) => resultados[chaveMarca(brandId)] === null);

  function contadorMarca(brandId: string) {
    const key = chaveMarca(brandId);
    if (!(key in resultados)) return null;
    const dados = resultados[key];
    return dados
      ? dados.resumo.totalPublicacoes
      : <TriangleAlert size={12} aria-label="Não foi possível consultar a contagem" />;
  }

  function alternarMarca(id: string) {
    setBrandIds((atual) => (
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
    ));
  }

  const CANAIS_FUTUROS = [
    { canal: "shopee", label: "Shopee" },
    { canal: "tiktok", label: "TikTok Shop" },
  ] as const;

  const abasCanal = (
    <div className="flex items-center gap-1" role="group" aria-label="Canal das publicações">
      <motion.button type="button" role="switch" aria-checked={canalAtivo}
        title={canalAtivo ? "Anúncios patrocinados do Mercado Livre, clique para ocultar" : "Anúncios patrocinados do Mercado Livre ocultos, clique para mostrar"}
        onClick={() => setCanalAtivo((v) => !v)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.88, rotate: -4 }}
        transition={springs.settleFast}
        style={canalAtivo ? { borderColor: "#8a7000" } : undefined}
        className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors duration-200 ${
          canalAtivo ? "border-2 bg-card/70 shadow-sm" : "border border-border/80 bg-card/40 opacity-40 hover:bg-card/70 hover:opacity-70"
        }`}>
        {canalAtivo && <HaloSelecao cor="#8a7000" />}
        <ChannelLogo canal="mercadolivre" size="sm" variant="logo" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {totalPublicacoesGeral === null
            ? algumaContagemFalhou
              ? <TriangleAlert size={12} aria-label="Não foi possível consultar a contagem" />
              : null
            : totalPublicacoesGeral}
        </span>
      </motion.button>
      {CANAIS_FUTUROS.map(({ canal, label }) => (
        <span key={canal} role="switch" aria-checked="false" aria-disabled="true"
          title={`${label} (em breve)`}
          className="inline-flex h-11 shrink-0 cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card/40 px-3.5 text-muted-foreground opacity-40">
          <ChannelLogo canal={canal} size="sm" variant="logo" />
          <span className="text-xs tabular-nums text-muted-foreground">0</span>
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
          <motion.button key={marca.brandId} type="button" role="switch" aria-checked={ativo} aria-label={marca.marcaLabel}
            onClick={() => alternarMarca(marca.brandId)}
            whileHover={{ y: -2, scale: 1.04 }}
            whileTap={{ scale: 0.92 }}
            transition={springs.settleFast}
            style={ativo && accent ? { borderColor: accent } : undefined}
            className={`relative inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${
              ativo
                ? "border-2 bg-card/70 shadow-sm"
                : "border border-border/80 bg-card/40 text-muted-foreground hover:bg-card/70 hover:text-foreground"
            }`}>
            {ativo && accent && <HaloSelecao cor={accent} />}
            {isBrandSlug(marca.slug) ? <BrandLogo brand={marca.slug} height={17} /> : marca.marcaLabel}
            <span className="text-xs tabular-nums text-muted-foreground">
              {contadorMarca(marca.brandId)}
            </span>
          </motion.button>
        );
      })}
    </div>
  );

  // Mesmo padrão de alinhamento do AcaoSlotFiltro usado em Vendem mais,
  // Repor em breve e Giro baixo: o filtro (marca + canal) centraliza sozinho
  // dentro do espaço disponível, e a ação extra ("Entenda os status") fica
  // fixa à direita, separada por um traço vertical — não é mais um bloco só
  // encostado à esquerda.
  const controles = (
    <div className="hidden w-full items-center gap-3 sm:flex">
      <div className="mx-auto flex min-w-0 flex-wrap items-center justify-center gap-3">
        {abasMarca}
        <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
        {abasCanal}
      </div>
      <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
      <EntendaStatusPublicacaoBotao />
    </div>
  );
  const controlesMobile = (
    <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:hidden">
      {abasMarca}
      {abasCanal}
    </div>
  );

  const reduzir = useReducedMotion();
  const periodo = periodoLabel(inicio, fim);
  return (
    <Card>
      <CardHead scope={controlesMobile} />
      {acaoSlot && createPortal(controles, acaoSlot)}
      {/* No mobile, "Entenda os status" sobe pra mesma linha do Período em
          vez de ficar lá embaixo, depois do filtro de marca/canal. */}
      {acaoSlot && createPortal(<div className="sm:hidden"><EntendaStatusPublicacaoBotao /></div>, acaoSlot)}
      <div className="px-4 pb-5 pt-4 sm:px-5">
        <AnimatePresence mode="wait">
          {brandIds.length === 0 ? (
            <EstadoVazio key="sem-marca" icone={Megaphone} texto="Selecione uma marca e depois ative o Mercado Livre para carregar as publicações patrocinadas." ilustrado />
          ) : !canalAtivo ? (
            <EstadoVazio key="sem-canal" icone={Megaphone} texto="Nenhum canal selecionado. Ative o Mercado Livre acima para ver as publicações." />
          ) : carregando ? (
            <motion.div key="carregando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Skeleton className="h-52 w-full" />
            </motion.div>
          ) : algumErro && totalPublicacoes === 0 ? (
            // "deu erro buscando" e "não tem publicação" eram a mesma tela —
            // quem via não sabia se devia tentar de novo ou se é assim mesmo.
            <EstadoVazio key="erro" icone={TriangleAlert} texto="Não foi possível buscar as publicações agora. Tente atualizar a página em instantes." />
          ) : totalPublicacoes === 0 ? (
            <EstadoVazio key="sem-dados" icone={LayoutGrid} texto="Nenhuma publicação com dados disponíveis para o filtro atual." ilustrado />
          ) : (
            <motion.div key="lista">
              {/* Resumo agregado antes da lista crua — antes pulava direto pra
                  anúncios individuais sem nenhuma visão de conjunto. */}
              <motion.div
                initial={reduzir ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springs.settleFast}
                className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-center"
              >
                <div>
                  <p className="text-lg font-bold tabular-nums">{totalPublicacoes}</p>
                  <p className="text-center text-[11px] text-muted-foreground">
                    {totalPublicacoes === 1 ? "publicação patrocinada" : "publicações patrocinadas"}{" "}
                    <CalculoPopover
                      compacto
                      titulo="Publicações patrocinadas"
                      significado="Quantidade de publicações que a conta de publicidade do Mercado Livre devolveu para as marcas selecionadas. Não representa todo o catálogo da loja."
                      formula="contagem de códigos de publicação únicos, consolidando o mesmo item quando ele participa de mais de uma campanha"
                      resultado={inteiro.format(totalPublicacoes)}
                      itens={[
                        { label: "Com veiculação", valor: inteiro.format(totalComVeiculacao) },
                        { label: "Sem veiculação", valor: inteiro.format(totalSemVeiculacao) },
                        { label: "Exibidas em destaque", valor: inteiro.format(itensCombinados.length) },
                      ]}
                      periodoLabel={periodo}
                      nota="O resumo considera todas as publicações retornadas. A grade destaca no máximo 20 por marca para não tornar a página lenta."
                    />
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums" style={totalComVeiculacao > 0 ? { color: "var(--success)" } : undefined}>{totalComVeiculacao}</p>
                  <p className="text-center text-[11px] text-muted-foreground">com veiculação{" "}
                    <CalculoPopover
                      compacto
                      titulo="Publicações com veiculação"
                      significado="Publicações que registraram alguma atividade publicitária dentro do período selecionado."
                      formula="entra na contagem quando há ao menos uma impressão, clique, valor investido, receita ou venda atribuída"
                      resultado={inteiro.format(totalComVeiculacao)}
                      itens={[
                        { label: "Com atividade", valor: inteiro.format(totalComVeiculacao) },
                        { label: "Sem atividade", valor: inteiro.format(totalSemVeiculacao) },
                      ]}
                      periodoLabel={periodo}
                      nota="Veiculação no período é diferente do status atual. Um anúncio pode estar em espera hoje e ainda possuir resultado no intervalo analisado."
                    />
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{retornoMedio === null ? "—" : `${retornoMedio.toFixed(1)}x`}</p>
                  <p className="text-center text-[11px] text-muted-foreground">retorno do período{" "}
                    <CalculoPopover
                      compacto
                      titulo="Retorno consolidado do período"
                      significado="Mostra quanto de receita atribuída retornou para cada real investido em todas as publicações selecionadas."
                      formula="receita atribuída total, dividida pelo investimento total"
                      resultado={retornoMedio === null ? "Não calculável" : `${retornoMedio.toFixed(1)}x`}
                      itens={[
                        { label: "Receita atribuída", valor: moeda.format(receitaTotal) },
                        { label: "Investimento", valor: moeda.format(investimentoTotal) },
                      ]}
                      periodoLabel={periodo}
                      nota={retornoMedio === null
                        ? "Nenhuma publicação consumiu investimento no período."
                        : "É um retorno ponderado pelos valores totais, não a média simples dos retornos individuais. Receita atribuída não é lucro líquido."}
                    />
                  </p>
                </div>
              </motion.div>
              <p className="mb-3 text-xs text-muted-foreground">
                Anúncios patrocinados{multiplasMarcas ? ` · ${selecionadas.length} marcas` : ""} · {periodo}
              </p>

              {totalComVeiculacao > itensCombinados.length && (
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Exibindo os {itensCombinados.length} anúncios com maior resultado entre {totalComVeiculacao} que tiveram veiculação no período.
                </p>
              )}

              <motion.div
                variants={variantes(reduzir, staggerExagerado)}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-3 lg:grid-cols-2"
              >
                {itensCombinados.map(({ item, marca }) => {
                  const roas = item.investimento > 0 ? item.receita / item.investimento : null;
                  const qualidadeLabel = item.qualidade !== null
                    ? `${inteiro.format(Math.round(item.qualidade))}/100`
                    : item.qualidadeStatus === "nao_consultada"
                      ? "Consultando"
                      : item.qualidadeStatus === "nao_aplicavel" ? "Não aplicável" : "Indisponível";
                  return (
                    <motion.article
                      key={`${marca?.brandId ?? ""}:${item.itemId}`}
                      layout
                      variants={variantes(reduzir, entradaExagerada)}
                      whileHover={reduzir ? undefined : { y: -4, scale: 1.012 }}
                      transition={springs.settle}
                      className="rounded-xl border border-border p-4 shadow-[0_1px_2px_rgba(14,15,19,.03)] transition-shadow hover:shadow-[0_10px_28px_rgba(14,15,19,.08)]"
                    >
                      {multiplasMarcas && marca && (
                        <div className="mb-1.5 flex items-center gap-1">
                          {isBrandSlug(marca.slug) ? <BrandLogo brand={marca.slug} height={11} /> : (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{marca.marcaLabel}</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <h4 className="min-w-0 truncate text-sm font-semibold">{item.titulo}</h4>
                        {/* Pendência sinaliza aqui em cima, perto do título — antes só
                            aparecia como texto no fim do card, fácil de passar batido
                            escaneando uma grade de 20 publicações. */}
                        {item.pendencias.length > 0 && (
                          <TriangleAlert size={13} className="shrink-0" style={{ color: "var(--warning)" }} aria-label="Publicação com pendência" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.itemId}
                        {item.dataCriacao && ` · publicado em ${formatarDataPublicacao(item.dataCriacao)}`}
                      </p>

                      {/* Status e qualidade lado a lado, os dois em selo colorido — antes
                          o status era texto cinza corrido junto do ID, fácil de perder
                          numa grade de cards; agora tem o mesmo peso visual da qualidade. */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                          style={{ color: corStatus(item.status), background: `color-mix(in srgb, ${corStatus(item.status)} 12%, transparent)` }}
                        >
                          {rotuloStatus(item.status)}
                          <CalculoPopover
                            compacto
                            titulo="Situação da veiculação"
                            significado="Estado atual que o Mercado Livre informa para este anúncio patrocinado. Ele é diferente do desempenho acumulado no período."
                            formula="tradução do status atual enviado pelo Mercado Livre: active, hold ou idle"
                            resultado={rotuloStatus(item.status)}
                            itens={[
                              { label: "Status atual", valor: rotuloStatus(item.status) },
                              { label: "Impressões no período", valor: inteiro.format(item.impressoes) },
                              { label: "Investimento no período", valor: moeda.format(item.investimento) },
                            ]}
                            periodoLabel={periodo}
                            nota="Ativo significa elegível para veicular, não garantia de impressões. Em espera indica alguma pausa ou restrição. Sem veiculação indica que o anúncio não está entregando publicidade agora."
                          />
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
                          style={{ color: corQualidade(item.qualidade), background: `color-mix(in srgb, ${corQualidade(item.qualidade)} 12%, transparent)` }}
                        >
                          {qualidadeLabel}
                          <CalculoPopover
                            compacto
                            titulo="Pontuação de qualidade"
                            significado="Nota de 0 a 100 que o Mercado Livre atribui à publicação, com base no preenchimento e na atratividade de fotos, ficha técnica, título e garantia."
                            formula="cálculo feito pelo Mercado Livre a partir dos atributos preenchidos no anúncio; não é um valor calculado pelo CRM"
                            resultado={qualidadeLabel}
                            itens={[
                              { label: "Nível", valor: traduzirNivelQualidade(item.nivelQualidade) },
                              { label: "Pendências abertas", valor: String(item.pendencias.length) },
                            ]}
                            nota={item.qualidadeStatus === "nao_consultada"
                              ? "As métricas de publicidade já estão disponíveis. Qualidade e pendências estão sendo consultadas separadamente para não atrasar o restante do card."
                              : item.qualidadeStatus === "nao_aplicavel" || item.qualidadeStatus === "indisponivel"
                              ? motivoQualidadeIndisponivel(item.status, item.qualidadeStatus)
                              : "A pontuação e as pendências representam a avaliação atual da publicação e não variam com o período selecionado. Uma nota alta não garante cliques ou vendas."}
                          />
                        </span>
                      </div>

                      <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-x-3 gap-y-3 text-sm">
                        <div>
                          <dt className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"><Eye size={12} /> Impressões
                            <CalculoPopover
                              compacto
                              titulo="Impressões patrocinadas"
                              significado="Quantidade de vezes que o Mercado Livre exibiu este anúncio patrocinado durante o período selecionado."
                              formula="total de impressões atribuídas à publicidade pelo Mercado Livre no período"
                              resultado={inteiro.format(item.impressoes)}
                              itens={[{ label: "Impressões", valor: inteiro.format(item.impressoes) }]}
                              periodoLabel={periodo}
                              nota="Impressão não é visita. A mesma pessoa pode visualizar o anúncio mais de uma vez, e uma impressão não garante clique nem venda."
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums">{inteiro.format(item.impressoes)}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"><MousePointerClick size={12} /> Cliques
                            <CalculoPopover
                              compacto
                              titulo="Cliques no anúncio"
                              significado="Quantidade de acessos gerados diretamente pelas impressões deste anúncio patrocinado."
                              formula="total de cliques atribuídos à publicidade pelo Mercado Livre no período"
                              resultado={inteiro.format(item.cliques)}
                              itens={[
                                { label: "Cliques", valor: inteiro.format(item.cliques) },
                                { label: "Taxa de cliques (CTR)", valor: item.ctr === null ? "Não calculável" : `${item.ctr.toFixed(2)}%` },
                                { label: "Impressões", valor: inteiro.format(item.impressoes) },
                              ]}
                              periodoLabel={periodo}
                              nota="CTR mede atração do anúncio, não vendas. Um CTR alto com poucas vendas pode indicar problema depois do clique, como preço, frete ou oferta."
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums">{inteiro.format(item.cliques)}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"><Package size={12} /> Vendas
                            <CalculoPopover
                              compacto
                              titulo="Vendas atribuídas"
                              significado="Quantidade de unidades que o Mercado Livre atribuiu à publicidade deste anúncio no período. Vendas orgânicas não entram neste número."
                              formula="total de unidades atribuídas ao anúncio patrocinado pelo Mercado Livre"
                              resultado={inteiro.format(item.unidadesAtribuidas)}
                              itens={[
                                { label: "Vendas atribuídas", valor: inteiro.format(item.unidadesAtribuidas) },
                                { label: "Conversão dos cliques (CVR)", valor: item.cvr === null ? "Não calculável" : `${item.cvr.toFixed(2)}%` },
                              ]}
                              periodoLabel={periodo}
                              nota="A atribuição segue as regras do Mercado Livre. Este número não representa todas as vendas do produto e não mistura pedidos orgânicos ou vendas locais."
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums">{inteiro.format(item.unidadesAtribuidas)}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"><Wallet size={12} /> Investimento
                            <CalculoPopover
                              compacto
                              titulo="Investimento em publicidade"
                              significado="Valor consumido pela veiculação deste anúncio patrocinado no período selecionado."
                              formula="soma do custo publicitário atribuído ao anúncio pelo Mercado Livre"
                              resultado={moeda.format(item.investimento)}
                              itens={[
                                { label: "Investimento realizado", valor: moeda.format(item.investimento) },
                                { label: "Cliques recebidos", valor: inteiro.format(item.cliques) },
                              ]}
                              periodoLabel={periodo}
                              nota="Este é o valor efetivamente consumido, não o orçamento configurado na campanha. Investimento zero significa que não houve custo atribuído no período."
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums">{moeda.format(item.investimento)}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"><BadgeDollarSign size={12} /> Receita
                            <CalculoPopover
                              compacto
                              titulo="Receita em anúncios"
                              significado="Valor faturado que o Mercado Livre atribui a esta publicação em razão do investimento em anúncios patrocinados durante o período."
                              formula="total de vendas que o Mercado Livre atribui a este anúncio patrocinado no período selecionado"
                              resultado={moeda.format(item.receita)}
                              itens={[
                                { label: "Receita atribuída", valor: moeda.format(item.receita) },
                                { label: "Investido em anúncio", valor: moeda.format(item.investimento) },
                                { label: "Vendas atribuídas", valor: inteiro.format(item.unidadesAtribuidas) },
                              ]}
                              periodoLabel={periodo}
                              nota="É receita bruta atribuída pela plataforma, não faturamento total do produto, margem ou lucro. Vendas orgânicas ficam fora."
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums">{moeda.format(item.receita)}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"><Gauge size={12} /> Retorno
                            <CalculoPopover
                              compacto
                              titulo="Retorno sobre o investimento"
                              significado="Indica quantas vezes o valor investido em anúncios patrocinados retornou em receita. É o indicador mais direto para avaliar se vale a pena manter o investimento neste anúncio."
                              formula="receita atribuída ao anúncio, dividida pelo valor investido nele no período"
                              resultado={roas === null ? "Não calculável" : `${roas.toFixed(1)}x`}
                              itens={[
                                { label: "Receita atribuída", valor: moeda.format(item.receita), fracao: roas === null ? undefined : Math.min(roas / 10, 1) },
                                { label: "Investido em anúncio", valor: moeda.format(item.investimento) },
                              ]}
                              periodoLabel={periodo}
                              nota={roas === null ? "Sem investimento no período, não existe retorno a calcular." : item.receita === 0 ? "Houve investimento, mas nenhuma receita foi atribuída. Por isso o retorno é 0,0x." : "Acima de 1x, a receita atribuída superou o valor investido; isso não representa lucro líquido."}
                            />
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums">{roas === null ? "Não calculável" : `${roas.toFixed(1)}x`}</dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <ShieldCheck size={13} /> Qualidade: {traduzirNivelQualidade(item.nivelQualidade)}
                        <CalculoPopover
                          compacto
                          titulo="Nível de qualidade"
                          significado="Faixa, representada por cor e palavra, que o Mercado Livre atribui à publicação com base na pontuação de 0 a 100 exibida no topo do painel. É a leitura resumida desse número."
                          formula="definição feita pelo Mercado Livre a partir de faixas fixas de pontuação; não é um valor calculado pelo CRM"
                          resultado={traduzirNivelQualidade(item.nivelQualidade)}
                          itens={[
                            { label: "Pontuação", valor: qualidadeLabel },
                            { label: "Pendências abertas", valor: String(item.pendencias.length) },
                          ]}
                          nota={item.qualidadeStatus === "nao_consultada"
                            ? "O nível de qualidade está sendo consultado. Impressões, cliques, vendas, investimento e receita já podem ser analisados normalmente."
                            : item.qualidadeStatus === "nao_aplicavel" || item.qualidadeStatus === "indisponivel"
                            ? motivoQualidadeIndisponivel(item.status, item.qualidadeStatus)
                            : "O nível resume a pontuação atual do cadastro. Ele não mede rentabilidade e não acompanha o intervalo escolhido no calendário."}
                        />
                      </div>
                      {item.pendencias.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: "var(--warning)" }}><TriangleAlert size={13} className="mt-0.5 shrink-0" /> {traduzirPendenciaPublicacao(item.pendencias[0])}</p>}
                    </motion.article>
                  );
                })}
              </motion.div>

              {totalSemVeiculacao > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-expanded={mostrarSemVeiculacao}
                      onClick={() => setMostrarSemVeiculacao((atual) => !atual)}
                      className="press-feedback flex min-h-11 flex-1 items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                      <span>{totalSemVeiculacao} {totalSemVeiculacao === 1 ? "publicação sem veiculação" : "publicações sem veiculação"} no período</span>
                      <span className="text-muted-foreground">{mostrarSemVeiculacao ? "Ocultar" : "Ver publicações"}</span>
                    </button>
                    <CalculoPopover
                      compacto
                      titulo="Sem veiculação no período"
                      significado="Grupo de publicações patrocinadas que não registraram atividade publicitária no intervalo selecionado."
                      formula="impressões, cliques, investimento, receita e vendas atribuídas iguais a zero no período"
                      resultado={inteiro.format(totalSemVeiculacao)}
                      itens={[
                        { label: "Sem atividade", valor: inteiro.format(totalSemVeiculacao) },
                        { label: "Exibidas na lista", valor: inteiro.format(itensSemVeiculacao.length) },
                      ]}
                      periodoLabel={periodo}
                      nota="Zero aqui é um resultado válido da API, não falha de carregamento. O status mostrado ao abrir a lista é atual e pode ser Ativo mesmo que o anúncio não tenha veiculado no período escolhido."
                    />
                  </div>
                  <AnimatePresence initial={false}>
                    {mostrarSemVeiculacao && (
                      <motion.div
                        initial={reduzir ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={reduzir ? undefined : { opacity: 0, height: 0 }}
                        transition={springs.settleFast}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                          {itensSemVeiculacao.map(({ item, marca }) => (
                            <div key={`${marca?.brandId ?? ""}:sem:${item.itemId}`} className="rounded-xl border border-border px-3 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold">{item.titulo}</p>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">{item.itemId}{multiplasMarcas && marca ? `, ${marca.marcaLabel}` : ""}</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">{rotuloStatus(item.status)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {totalSemVeiculacao > itensSemVeiculacao.length && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Exibindo {itensSemVeiculacao.length} de {totalSemVeiculacao}. As demais também não tiveram impressões, cliques, investimento ou vendas atribuídas no período.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {algumParcial && (
          <div className="mt-4">
            <AvisoParcial>
              <TriangleAlert size={14} className="mt-0.5 shrink-0" style={{ color: "var(--warning)" }} />
              O Mercado Livre não disponibiliza a pontuação de qualidade para algumas publicações exibidas.
            </AvisoParcial>
          </div>
        )}
      </div>
    </Card>
  );
}

function EstadoVazio({ icone: Icone, texto, ilustrado }: { icone: typeof Megaphone; texto: string; ilustrado?: boolean }) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduzir ? undefined : { opacity: 0, scale: 0.98 }}
      transition={springs.settle}
      className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground"
    >
      {/* As duas telas "não há nada mesmo aqui" (sem marca escolhida, sem
          dado retornado) ganham a ilustração dedicada de Publicações — as
          outras (canal desligado, erro de rede) continuam com ícone simples,
          por serem estados passageiros, não uma galeria vazia de verdade. */}
      {ilustrado ? <PublicidadeIllustration /> : <Icone size={28} className="text-muted-foreground/50" />}
      <p className="max-w-xs">{texto}</p>
    </motion.div>
  );
}
