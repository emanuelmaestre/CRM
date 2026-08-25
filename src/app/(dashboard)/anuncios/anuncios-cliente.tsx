"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { BarChart3, GitCompare, History, Package, PlugZap2 } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { stagger } from "@/shared/design-system/motion-variants";
import { tint } from "@/shared/design-system/color";
import anunciosConfig from "@/config/anuncios.json";
import channelsConfig from "@/config/channels.json";
import { actionObterVisaoGeralAnuncios } from "./actions";
import type { CanalConfiguracao } from "@/modules/canais/application/configuracao-canais.service";
import { CampanhasCard } from "./campanhas-card";
import { KpisPrincipais } from "./kpis-principais";
import { OrganicoCard } from "./organico-card";
import { RotuloComInfo, SectionLabel } from "./anuncios-primitives";
import type { VisaoGeralMarca, VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";

const copy = anunciosConfig;

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR");
const decimal1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const roasTexto = (valor: number | null) => valor === null ? "sem dado" : `${decimal2.format(valor)}x`;
const variacaoTexto = (valor: number) => `${valor >= 0 ? "+" : ""}${decimal1.format(valor)}%`;
const periodoAnteriorTexto = (dias: number) => dias === 1 ? "o dia anterior" : `os ${dias} dias anteriores`;
const periodoAnteriorComPreposicao = (dias: number) => dias === 1 ? "no dia anterior" : `nos ${dias} dias anteriores`;
const paraISO = (data: Date) => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
const hojeISO = paraISO(new Date());
// Pré-selecionado em Hoje, igual ao resto do app (Métricas, Publicidade e
// as demais listas) — antes vinha em 30 dias, um recorte diferente do
// padrão adotado nos outros módulos.
function periodoInicial() {
  return { inicio: hojeISO, fim: hojeISO };
}

function descricaoComparacaoRoas({
  atual,
  anterior,
  variacao,
  dias,
}: {
  atual: number | null;
  anterior: number | null;
  variacao: number | null;
  dias: number;
}) {
  const observacao = "ROAS compara receita atribuída com investimento. Uma alta indica mais retorno por real investido; ainda assim, confirme junto com investimento, receita e margem, porque ROAS não é lucro.";
  const atualTexto = roasTexto(atual);

  if (anterior === null) {
    return {
      descricao: `ROAS atual: ${atualTexto}. Ainda não há período anterior carregado para comparar com ${periodoAnteriorTexto(dias)}. Use este número para ver quanto cada real investido está retornando em receita atribuída agora.`,
      observacao,
    };
  }

  const anteriorTexto = roasTexto(anterior);

  if (variacao === null) {
    return {
      descricao: `ROAS atual: ${atualTexto}. No período anterior, era ${anteriorTexto}. Sem base percentual confiável porque o período anterior ficou zerado ou sem dado. Compare a direção do número, mas evite ler como crescimento percentual.`,
      observacao,
    };
  }

  const leitura = variacao > 0
    ? "A eficiência melhorou: cada real investido passou a retornar mais receita atribuída."
    : variacao < 0
      ? "A eficiência piorou: cada real investido passou a retornar menos receita atribuída."
      : "A eficiência ficou estável: cada real investido retornou praticamente a mesma receita atribuída.";

  return {
    descricao: `ROAS atual: ${atualTexto}. ${periodoAnteriorComPreposicao(dias)}, era ${anteriorTexto}. A variação foi de ${variacaoTexto(variacao)}. ${leitura}`,
    observacao,
  };
}

function descricaoComparacaoInvestimento({
  atual,
  anterior,
  variacao,
  dias,
}: {
  atual: number;
  anterior: number | null;
  variacao: number | null;
  dias: number;
}) {
  const observacao = "Investimento é o gasto de mídia registrado nos anúncios. Ele não inclui custo do produto, taxas, frete, impostos ou outras despesas da operação.";
  const atualTexto = moeda.format(atual);

  if (anterior === null) {
    return {
      descricao: `Investimento atual: ${atualTexto}. Ainda não há período anterior carregado para comparar com ${periodoAnteriorTexto(dias)}. Use este valor junto com Receita Ads e ROAS para entender se o gasto está trazendo retorno.`,
      observacao,
    };
  }

  const anteriorTexto = moeda.format(anterior);

  if (variacao === null) {
    return {
      descricao: `Investimento atual: ${atualTexto}. ${periodoAnteriorComPreposicao(dias)}, era ${anteriorTexto}. Sem base percentual confiável porque o período anterior ficou zerado. Compare o valor absoluto, mas evite ler como crescimento percentual.`,
      observacao,
    };
  }

  const leitura = variacao > 0
    ? "O gasto em mídia aumentou; confira se a receita de anúncios, as conversões e o ROAS cresceram junto."
    : variacao < 0
      ? "O gasto em mídia diminuiu; se receita ou conversões caíram, parte da queda pode vir de menor volume de investimento."
      : "O gasto em mídia ficou praticamente estável em relação ao período anterior.";

  return {
    descricao: `Investimento atual: ${atualTexto}. ${periodoAnteriorComPreposicao(dias)}, era ${anteriorTexto}. A variação foi de ${variacaoTexto(variacao)}. ${leitura}`,
    observacao,
  };
}

function descricaoComparacaoReceitaAds({
  atual,
  anterior,
  variacao,
  dias,
}: {
  atual: number;
  anterior: number | null;
  variacao: number | null;
  dias: number;
}) {
  const observacao = "Receita de anúncios é o valor que a plataforma atribuiu aos anúncios. Não é a receita total da marca nem o lucro, pois ainda não desconta mídia, custo do produto, taxas, frete ou impostos.";
  const atualTexto = moeda.format(atual);

  if (anterior === null) {
    return {
      descricao: `Receita de anúncios atual: ${atualTexto}. Ainda não há período anterior carregado para comparar com ${periodoAnteriorTexto(dias)}. Use este valor junto com investimento e ROAS para entender o retorno da mídia paga.`,
      observacao,
    };
  }

  const anteriorTexto = moeda.format(anterior);

  if (variacao === null) {
    return {
      descricao: `Receita Ads atual: ${atualTexto}. ${periodoAnteriorComPreposicao(dias)}, era ${anteriorTexto}. Sem base percentual confiável porque o período anterior ficou zerado. Compare o valor absoluto, mas evite ler como crescimento percentual.`,
      observacao,
    };
  }

  const leitura = variacao > 0
    ? "A receita atribuída aos anúncios cresceu; confira se esse aumento veio com ROAS saudável e investimento controlado."
    : variacao < 0
      ? "A receita atribuída aos anúncios caiu; veja se a queda veio de menos investimento, menos conversões ou pior eficiência."
      : "A receita atribuída aos anúncios ficou praticamente estável em relação ao período anterior.";

  return {
    descricao: `Receita Ads atual: ${atualTexto}. ${periodoAnteriorComPreposicao(dias)}, era ${anteriorTexto}. A variação foi de ${variacaoTexto(variacao)}. ${leitura}`,
    observacao,
  };
}

function descricaoComparacaoConversoes({
  atual,
  anterior,
  variacao,
  dias,
}: {
  atual: number;
  anterior: number | null;
  variacao: number | null;
  dias: number;
}) {
  const observacao = "Conversões, nesta tela, são vendas atribuídas aos anúncios pelas regras da plataforma. Mais conversões não significa automaticamente mais lucro: confirme junto com investimento, receita, CVR e ROAS.";
  const atualTexto = inteiro.format(atual);
  const conversaoAtual = atual === 1 ? "1 venda atribuída" : `${atualTexto} vendas atribuídas`;

  if (anterior === null) {
    return {
      descricao: `Conversões atuais: ${atualTexto}. Neste período, os anúncios geraram ${conversaoAtual}. Ainda não há período anterior carregado para comparar com ${periodoAnteriorTexto(dias)}.`,
      observacao,
    };
  }

  const anteriorTexto = inteiro.format(anterior);

  if (variacao === null) {
    return {
      descricao: `Conversões atuais: ${atualTexto}. ${periodoAnteriorComPreposicao(dias)}, foram ${anteriorTexto}. Sem base percentual confiável porque o período anterior ficou zerado. Compare o volume absoluto, mas evite ler como crescimento percentual.`,
      observacao,
    };
  }

  const leitura = variacao > 0
    ? "Os anúncios geraram mais vendas atribuídas do que antes; confira se o crescimento veio acompanhado de receita e ROAS saudáveis."
    : variacao < 0
      ? "Os anúncios geraram menos vendas atribuídas do que antes; confira se a queda veio de menos cliques, CVR pior ou investimento menor."
      : "Os anúncios mantiveram praticamente o mesmo volume de vendas atribuídas do período anterior.";

  return {
    descricao: `Conversões atuais: ${atualTexto}. ${periodoAnteriorComPreposicao(dias)}, foram ${anteriorTexto}. A variação foi de ${variacaoTexto(variacao)}. ${leitura}`,
    observacao,
  };
}

/* ── Seletor de marca ─────────────────────────────────────────
   Uma marca por vez: campanhas, orçamento e ROAS de marcas diferentes não
   deveriam se misturar na mesma leitura — é assim que Métricas e Painel já
   funcionam neste produto (linguagem consistente, brief seção "Não crie
   uma aplicação separada"). */
function brandColor(slug: string) {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

/** Anel na cor da pílula que nasce colado nela e se expande sumindo — só
 *  toca quando `ativo` PASSA a ser true. Cópia exata do mesmo componente em
 *  Estoque, pro selecionar de marca/canal ter a mesma linguagem visual em
 *  todo o app (páginas irmãs, não uma dependendo da outra). */
function HaloSelecao({ ativo, cor, reduzir }: { ativo: boolean; cor: string; reduzir: boolean | null }) {
  return (
    <AnimatePresence>
      {ativo && !reduzir && (
        <motion.span
          key="halo"
          initial={{ opacity: 0.55, scale: 0.82 }}
          animate={{ opacity: 0, scale: 1.4 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: `2px solid ${cor}` }}
        />
      )}
    </AnimatePresence>
  );
}

export function SeletorMarca({ marcas, ativa, onChange }: {
  marcas: VisaoGeralMarca[];
  ativa: string | null;
  onChange: (brandId: string) => void;
}) {
  const reduzir = useReducedMotion();
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {marcas.map((marca) => {
        const selecionada = marca.brandId === ativa;
        return (
          <motion.button
            key={marca.brandId}
            type="button"
            role="tab"
            aria-selected={selecionada}
            onClick={() => onChange(marca.brandId)}
            whileHover={!reduzir ? { y: -2, scale: 1.04 } : undefined}
            whileTap={!reduzir ? { scale: 0.92 } : undefined}
            className={`relative inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
              selecionada ? "border-2 bg-card/70" : "border border-border/80 bg-card/40 hover:bg-card/70"
            }`}
            style={selecionada ? { borderColor: brandColor(marca.brandSlug) } : undefined}
          >
            <HaloSelecao ativo={selecionada} cor={brandColor(marca.brandSlug)} reduzir={reduzir} />
            {isBrandSlug(marca.brandSlug)
              ? <BrandLogo brand={marca.brandSlug} height={17} />
              : <span className="text-sm font-semibold text-foreground">{marca.brandLabel}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

const CANAIS_ANUNCIOS = ["mercadolivre", "shopee", "tiktokshop"] as const;

/** Mercado Livre é a única fonte de dado de Publicidade hoje — não existe
 *  integração de Product Ads pra Shopee/TikTok Shop ainda. Mostra os 3 pra
 *  deixar claro que a tela é sobre canais de venda (mesma leitura de
 *  Vendas/Estoque), mas Shopee/TikTok ficam travados como "ainda não
 *  disponível" em vez de fingir que dá pra filtrar por eles. */
export function SeletorCanalAnuncios() {
  const reduzir = useReducedMotion();
  return (
    <div className="flex flex-wrap gap-1.5">
      {CANAIS_ANUNCIOS.map((canal) => {
        const disponivel = canal === "mercadolivre";
        const label = (channelsConfig.items as Record<string, { label?: string }>)[canal]?.label ?? canal;
        return (
          <motion.button
            key={canal}
            type="button"
            whileHover={disponivel && !reduzir ? { y: -2, scale: 1.04 } : undefined}
            whileTap={!reduzir ? { scale: disponivel ? 0.92 : 0.97 } : undefined}
            aria-pressed={disponivel}
            title={disponivel ? label : `Publicidade de ${label} ainda não está disponível`}
            aria-label={disponivel ? label : `${label} — ainda não disponível`}
            onClick={disponivel ? undefined : () => toast.info(`Publicidade de ${label} ainda não está disponível.`)}
            className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${
              disponivel
                ? "border-2 border-selecionado bg-selecionado/12"
                : "border border-border opacity-50"
            }`}
          >
            <HaloSelecao ativo={disponivel} cor="var(--selecionado)" reduzir={reduzir} />
            <ChannelLogo canal={canal} size="sm" variant="logo" />
            {!disponivel && <PlugZap2 size={14} className="text-muted-foreground" />}
          </motion.button>
        );
      })}
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

export function AnunciosCliente({ periodoServidor, dadosIniciais, contasIniciais = [] }: {
  /** Janela de 30 dias calculada no servidor. Vem como prop em vez de ser
   *  recalculada aqui para que a chave do período bata exatamente com a dos
   *  dados pré-buscados — recalcular no navegador poderia cair em outro dia
   *  (fuso do servidor vs. do usuário) e jogar fora a busca já feita. */
  periodoServidor?: { inicio: string; fim: string };
  /** Visão geral do período atual e do anterior, já resolvidas no servidor. */
  dadosIniciais?: { dados: VisaoGeralResultado | null; anterior: VisaoGeralResultado | null } | null;
  contasIniciais?: CanalConfiguracao[];
}) {
  const [periodo, setPeriodo] = useState(() => periodoServidor ?? periodoInicial());
  // "Limpar" no calendário volta o período pra "" — sem isso, o resto do
  // componente (busca de dados, exportar PDF, cálculo de dias pro período
  // anterior) fazia `new Date("T12:00:00")` (Invalid Date) e mandava
  // "NaN-NaN-NaN" pro servidor, quebrando a tela. periodoEfetivo cai pro
  // período padrão de 30 dias sempre que inicio/fim estiverem vazios —
  // mesmo padrão já usado em Métricas.
  const periodoEfetivo = periodo.inicio && periodo.fim ? periodo : periodoInicial();
  const chaveInicial = `${periodoEfetivo.inicio}:${periodoEfetivo.fim}`;
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(
    dadosIniciais?.dados?.marcas[0]?.brandId ?? null,
  );
  const [consulta, setConsulta] = useState<{ chave: string; dados: VisaoGeralResultado | null; anterior: VisaoGeralResultado | null }>(
    dadosIniciais?.dados
      ? { chave: chaveInicial, dados: dadosIniciais.dados, anterior: dadosIniciais.anterior }
      : { chave: "", dados: null, anterior: null },
  );
  const dados = consulta.dados;
  const chavePeriodo = `${periodoEfetivo.inicio}:${periodoEfetivo.fim}`;
  const carregando = consulta.chave !== chavePeriodo;

  const buscar = useCallback(() => {
    let ativo = true;
    const inicio = new Date(`${periodoEfetivo.inicio}T12:00:00`);
    const fim = new Date(`${periodoEfetivo.fim}T12:00:00`);
    const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1);
    const fimAnterior = new Date(inicio); fimAnterior.setDate(fimAnterior.getDate() - 1);
    const inicioAnterior = new Date(fimAnterior); inicioAnterior.setDate(inicioAnterior.getDate() - (dias - 1));
    Promise.all([
      actionObterVisaoGeralAnuncios({ inicio: periodoEfetivo.inicio, fim: periodoEfetivo.fim }),
      actionObterVisaoGeralAnuncios({ inicio: paraISO(inicioAnterior), fim: paraISO(fimAnterior) }),
    ])
      .then(([resultado, anterior]) => {
        if (!ativo) return;
        setConsulta({ chave: chavePeriodo, dados: resultado, anterior });
        setMarcaAtiva((atual) => atual ?? resultado.marcas[0]?.brandId ?? null);
      })
      .catch(() => { if (ativo) { setConsulta({ chave: chavePeriodo, dados: null, anterior: null }); toast.error(copy.erros.carregar); } });
    return () => { ativo = false; };
  }, [periodoEfetivo.inicio, periodoEfetivo.fim, chavePeriodo]);

  // Quando o servidor já mandou os dados do período inicial, a primeira
  // execução destes efeitos é pulada — ela só refaria no navegador a busca
  // que acabou de chegar dentro do HTML. Trocar o período depois continua
  // caindo aqui normalmente.
  const primeiraBusca = useRef(Boolean(dadosIniciais?.dados));

  useEffect(() => {
    if (primeiraBusca.current) { primeiraBusca.current = false; return; }
    return buscar();
  }, [buscar]);

  if (carregando) return <Esqueleto />;

  if (!dados || dados.semDados) {
    return (
      <div className="card-surface">
        <EmptyState illustration="generic" title={copy.vazio.titulo} description={copy.vazio.descricao} />
      </div>
    );
  }

  const marca = dados.marcas.find((item) => item.brandId === marcaAtiva) ?? dados.marcas[0];
  const marcaAnterior = consulta.anterior?.marcas.find((item) => item.brandId === marca.brandId) ?? null;
  // Período/Hoje pintam com a cor da marca ativa — mesma identidade que já
  // aparece na logo dela na pílula de seleção, em vez de um teal genérico.
  const acentoMarca = isBrandSlug(marca.brandSlug) ? getBrandConfig(marca.brandSlug)?.color : undefined;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* Header — marca + última sincronização, sempre visível: nunca deixar
          o usuário pensar que o número é em tempo real quando não é. */}
      {/* Antes, PDF/sincronização/atualizar viviam soltos na mesma linha
          flex do resto — no mobile, quando a linha estourava, o botão de
          atualizar sobrava sozinho longe do texto que ele atualiza. Agora
          formam um grupo só, que quebra (ou não) como unidade. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
          <SeletorCanalAnuncios />
          <SeletorMarca marcas={dados.marcas} ativa={marca.brandId} onChange={setMarcaAtiva} />
        </div>
        {/* Período, Hoje, PDF e sincronizar viram um grupo só — antes o
            período ficava colado nas pílulas de marca/canal, empurrando
            PDF/sincronizar pra outra linha por conta própria. Juntos aqui,
            tentam caber numa linha só e só quebram quando não cabe mesmo. */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start sm:gap-3">
          <CalendarioPopoverRange
            rotulo="Período"
            valor={periodo}
            max={hojeISO}
            onChange={setPeriodo}
            accent={acentoMarca}
          />
        </div>
      </div>

      {/* Risco separador só no mobile, entre o grupo de Período/PDF/sincronizar
          e a fileira de atalhos abaixo — mesma lógica do risco acima, entre
          marca/canal e período (esmaecido nas pontas, não de ponta a ponta). */}
      <span
        aria-hidden="true"
        className="h-px w-full sm:hidden"
        style={{ background: "linear-gradient(to right, transparent, var(--border) 15%, var(--border) 85%, transparent)" }}
      />

      {/* Navegação pro resto do módulo — antes vivia pendurada como texto
          minúsculo do lado do rótulo "Campanhas", parecendo detalhe daquela
          seção. São páginas irmãs (Produtos, Histórico, Comparação,
          Campanhas completo), não sub-itens — por isso ganham linha própria
          aqui em cima, com peso de botão em vez de texto solto. */}
      <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
        {/* Cada atalho leva a própria cor de identidade (mesmo selo com fundo
            tingido usado nos blocos do mosaico de Métricas) — antes eram 4
            botões cinza idênticos, difíceis de diferenciar num relance. A
            borda acompanha a cor no hover, o resto do botão continua neutro.
            Grade 2x2 até o sm (os 4 atalhos em duas fileiras parelhas); do sm
            em diante volta a ser uma fileira só, como sempre foi. */}
        <Link
          href="/publicidade/produtos"
          className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card pl-1.5 pr-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-[#157781] hover:text-foreground lg:justify-start"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: tint("#157781", 9), color: "#157781" }}>
            <Package size={14} />
          </span>
          <span className="lg:hidden">Produtos</span><span className="hidden lg:inline">Ver produtos</span>
        </Link>
        <Link
          href="/publicidade/historico"
          className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card pl-1.5 pr-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-[#2563EB] hover:text-foreground lg:justify-start"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: tint("#2563EB", 9), color: "#2563EB" }}>
            <History size={14} />
          </span>
          <span className="lg:hidden">Histórico</span><span className="hidden lg:inline">Ver histórico</span>
        </Link>
        {dados.marcas.length >= 2 && (
          <Link
            href="/publicidade/comparacao"
            className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card pl-1.5 pr-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-[#7058D3] hover:text-foreground lg:justify-start"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: tint("#7058D3", 9), color: "#7058D3" }}>
              <GitCompare size={14} />
            </span>
            Comparar marcas
          </Link>
        )}
        <Link
          href="/publicidade/campanhas"
          className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card pl-1.5 pr-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-[#C42E79] hover:text-foreground lg:justify-start"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: tint("#C42E79", 9), color: "#C42E79" }}>
            <BarChart3 size={14} />
          </span>
          <span className="lg:hidden">Campanhas</span><span className="hidden lg:inline">{copy.campanhas.verTodas}</span>
        </Link>
      </div>

      {/* Ato 1 — os quatro números que respondem "o que está acontecendo" */}
      <KpisPrincipais resumo={marca.resumo} />

      <ComparativoPeriodo atual={marca} anterior={marcaAnterior} dias={Math.max(1, Math.round((new Date(`${periodoEfetivo.fim}T12:00:00`).getTime() - new Date(`${periodoEfetivo.inicio}T12:00:00`).getTime()) / 86_400_000) + 1)} />

      {/* Ato 2 — performance por campanha, a tabela de trabalho */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Campanhas</SectionLabel>
        <CampanhasCard campanhas={marca.campanhas} marca={marca} />
      </section>

      {/* Ato 3 — o que a mídia paga está puxando */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Dependência de mídia</SectionLabel>
        <OrganicoCard resumo={marca.resumo} resumoAnterior={marcaAnterior?.resumo ?? null} marca={marca} />
      </section>
    </motion.div>
  );
}

function ComparativoPeriodo({ atual, anterior, dias }: { atual: VisaoGeralMarca; anterior: VisaoGeralMarca | null; dias: number }) {
  const variacao = (valor: number, base: number) => base === 0 ? null : Math.round(((valor - base) / Math.abs(base)) * 1000) / 10;
  const variacaoRoas = (valor: number | null, base: number | null) => base === null ? null : variacao(valor ?? 0, base);
  const investimentoAnterior = anterior?.resumo.investimentoTotal ?? null;
  const receitaAnterior = anterior?.resumo.receitaTotal ?? null;
  const roasAnterior = anterior?.resumo.roasMedio ?? null;
  const conversoesAnteriores = anterior?.resumo.vendas ?? null;
  const comparacaoInvestimento = descricaoComparacaoInvestimento({
    atual: atual.resumo.investimentoTotal,
    anterior: investimentoAnterior,
    variacao: variacao(atual.resumo.investimentoTotal, investimentoAnterior ?? 0),
    dias,
  });
  const comparacaoReceitaAds = descricaoComparacaoReceitaAds({
    atual: atual.resumo.receitaTotal,
    anterior: receitaAnterior,
    variacao: variacao(atual.resumo.receitaTotal, receitaAnterior ?? 0),
    dias,
  });
  const comparacaoRoas = descricaoComparacaoRoas({
    atual: atual.resumo.roasMedio,
    anterior: roasAnterior,
    variacao: variacaoRoas(atual.resumo.roasMedio, roasAnterior),
    dias,
  });
  const comparacaoConversoes = descricaoComparacaoConversoes({
    atual: atual.resumo.vendas,
    anterior: conversoesAnteriores,
    variacao: variacao(atual.resumo.vendas, conversoesAnteriores ?? 0),
    dias,
  });
  const itens = [
    {
      label: "Investimento (dinheiro gasto em anúncios)",
      descricao: comparacaoInvestimento.descricao,
      observacao: comparacaoInvestimento.observacao,
      valor: variacao(atual.resumo.investimentoTotal, investimentoAnterior ?? 0),
    },
    {
      label: "Receita de anúncios (venda atribuída ao anúncio)",
      descricao: comparacaoReceitaAds.descricao,
      observacao: comparacaoReceitaAds.observacao,
      valor: variacao(atual.resumo.receitaTotal, receitaAnterior ?? 0),
    },
    {
      label: "ROAS (retorno por real investido)",
      descricao: comparacaoRoas.descricao,
      observacao: comparacaoRoas.observacao,
      valor: variacaoRoas(atual.resumo.roasMedio, roasAnterior),
    },
    {
      label: "Conversões (vendas feitas pelo anúncio)",
      descricao: comparacaoConversoes.descricao,
      observacao: comparacaoConversoes.observacao,
      valor: variacao(atual.resumo.vendas, conversoesAnteriores ?? 0),
    },
  ];
  return <section className="rounded-2xl border border-border bg-card px-4 py-3">
    <div className="flex flex-wrap items-center gap-3"><p className="text-xs font-semibold text-foreground">Comparação com {periodoAnteriorTexto(dias)}</p><span className="h-px flex-1 bg-border" /></div>
    <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{itens.map((item) => <div key={item.label}><dt className="text-[10px] uppercase text-muted-foreground"><RotuloComInfo descricao={item.descricao} observacao={item.observacao}>{item.label}</RotuloComInfo></dt><dd className={`mt-0.5 text-sm font-bold ${item.valor === null ? "text-muted-foreground" : item.valor >= 0 ? "text-success" : "text-destructive"}`}>{item.valor === null ? "Sem base" : variacaoTexto(item.valor)}</dd></div>)}</dl>
  </section>;
}
