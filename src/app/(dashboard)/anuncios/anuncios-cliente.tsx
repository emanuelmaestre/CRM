"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { BarChart3, GitCompare, History, Package, PlugZap2 } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";
import { compararMarcas, getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { stagger } from "@/shared/design-system/motion-variants";
import { tint } from "@/shared/design-system/color";
import { useAtualizacaoLocal } from "@/shared/lib/atualizacao-local";
import anunciosConfig from "@/config/anuncios.json";
import channelsConfig from "@/config/channels.json";
import { actionObterVisaoGeralAnuncios } from "./actions";
import { useCanalAnuncios } from "./canal-anuncios";
import {
  ehPlataformaAnuncios, inicioDaJanelaPadrao,
  PLATAFORMA_ANUNCIOS_PADRAO, type PlataformaAnuncios,
} from "@/modules/anuncios/domain/plataformas";

/** Canal em que o servidor pré-buscou `dadosIniciais`. Ele não sabe a
 *  preferência guardada no navegador, então sempre usa o padrão — por isso a
 *  busca no cliente só é pulada quando o canal restaurado bate com este. */
const PLATAFORMA_DOS_DADOS_INICIAIS = PLATAFORMA_ANUNCIOS_PADRAO;
import { CampanhasCard } from "./campanhas-card";
import { KpisPrincipais } from "./kpis-principais";
import { OrganicoCard } from "./organico-card";
import { AvisoJanela, RotuloComInfo, SectionLabel } from "./anuncios-primitives";
import type { MarcaIndisponivel, VisaoGeralMarca, VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";

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
/* Sem escolha no calendário, a janela é a DO CANAL, não a da tela.

   O Mercado Livre continua pré-selecionado em Hoje, igual ao resto do app
   (Métricas e as demais listas). A Shopee abre nos últimos 7 dias porque ela
   credita a venda até uma semana depois do clique: no dia de hoje ela mostra
   o gasto inteiro e quase nenhuma receita, e a tela abria com ROAS zero tendo
   90 dias de dado saudável logo atrás. Ver domain/plataformas.ts. */
function periodoDoCanal(fim: string, canal: PlataformaAnuncios) {
  return { inicio: inicioDaJanelaPadrao(fim, canal), fim };
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
      descricao: `Investimento atual: ${atualTexto}. Ainda não há período anterior carregado para comparar com ${periodoAnteriorTexto(dias)}. Use este valor junto com a receita dos anúncios e o ROAS para entender se o gasto está trazendo retorno.`,
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
      descricao: `Receita dos anúncios atual: ${atualTexto}. ${periodoAnteriorComPreposicao(dias)}, era ${anteriorTexto}. Sem base percentual confiável porque o período anterior ficou zerado. Compare o valor absoluto, mas evite ler como crescimento percentual.`,
      observacao,
    };
  }

  const leitura = variacao > 0
    ? "A receita atribuída aos anúncios cresceu; confira se esse aumento veio com ROAS saudável e investimento controlado."
    : variacao < 0
      ? "A receita atribuída aos anúncios caiu; veja se a queda veio de menos investimento, menos conversões ou pior eficiência."
      : "A receita atribuída aos anúncios ficou praticamente estável em relação ao período anterior.";

  return {
    descricao: `Receita dos anúncios atual: ${atualTexto}. ${periodoAnteriorComPreposicao(dias)}, era ${anteriorTexto}. A variação foi de ${variacaoTexto(variacao)}. ${leitura}`,
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

export function SeletorMarca({ marcas, ativa, onChange, indisponiveis = [] }: {
  marcas: VisaoGeralMarca[];
  ativa: string | null;
  onChange: (brandId: string) => void;
  /** Marcas ativas sem anúncio no canal escolhido. Opcional porque as
   *  sub-páginas do módulo ainda não calculam essa lista. */
  indisponiveis?: MarcaIndisponivel[];
}) {
  const reduzir = useReducedMotion();
  /* O servidor devolve as marcas na ordem da consulta; a fileira precisa da
     ordem canonica de brands.json, senao a mesma barra sai numa ordem aqui e
     noutra em Metricas. */
  const emOrdem = [...marcas].sort((a, b) => compararMarcas(a.brandSlug, b.brandSlug));
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {emOrdem.map((marca) => {
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

      {/* Marca ativa que não anuncia neste canal: fica apagada e travada, com
          o mesmo ícone de tomada usado no canal ainda não integrado, em vez de
          sumir da fileira. Some sem explicação, o usuário não distingue "não
          anuncia aqui" de "quebrou" — foi exatamente a dúvida que a KARZI
          causou ao desaparecer quando a Shopee era selecionada. */}
      {indisponiveis.map((marca) => (
        <button
          key={marca.brandId}
          type="button"
          disabled
          aria-disabled="true"
          title={`${marca.brandLabel} não tem anúncios neste canal`}
          aria-label={`${marca.brandLabel} — sem anúncios neste canal`}
          onClick={() => toast.info(`${marca.brandLabel} não tem anúncios neste canal.`)}
          className="relative inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card/40 px-4 opacity-50"
        >
          {isBrandSlug(marca.brandSlug)
            ? <BrandLogo brand={marca.brandSlug} height={17} />
            : <span className="text-sm font-semibold text-foreground">{marca.brandLabel}</span>}
          <PlugZap2 size={14} className="text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

const CANAIS_ANUNCIOS = ["mercadolivre", "shopee", "tiktokshop"] as const;

/** Mercado Livre e Shopee têm Product Ads integrado; TikTok Shop não, e fica
 *  travado como "ainda não disponível" em vez de fingir que dá pra filtrar por
 *  ele. Escolha única, não múltipla: somar os dois canais num ROAS só não
 *  significaria nada (a Shopee atribui venda em 7 dias após o clique, o
 *  Mercado Livre não usa essa janela) — comparar canais é a tela de
 *  Comparação, não um total. */
export function SeletorCanalAnuncios() {
  const reduzir = useReducedMotion();
  const { canal: canalAtivo, definirCanal } = useCanalAnuncios();

  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Canal de publicidade">
      {CANAIS_ANUNCIOS.map((canal) => {
        const disponivel = ehPlataformaAnuncios(canal);
        const ativo = disponivel && canal === canalAtivo;
        const label = (channelsConfig.items as Record<string, { label?: string }>)[canal]?.label ?? canal;
        return (
          <motion.button
            key={canal}
            type="button"
            role="tab"
            whileHover={disponivel && !reduzir ? { y: -2, scale: 1.04 } : undefined}
            whileTap={!reduzir ? { scale: disponivel ? 0.92 : 0.97 } : undefined}
            aria-selected={ativo}
            disabled={!disponivel}
            title={disponivel ? label : `Publicidade de ${label} ainda não está disponível`}
            aria-label={disponivel ? label : `${label} — ainda não disponível`}
            onClick={disponivel
              ? () => definirCanal(canal)
              : () => toast.info(`Publicidade de ${label} ainda não está disponível.`)}
            // Canal escolhido usa a COR DO CANAL, igual a Vendas, Estoque,
            // Clientes e Métricas — aqui ele era o roxo de seleção, então a
            // Shopee selecionada ficava lilás enquanto a marca ao lado, na
            // mesma fileira, acendia na cor dela. Duas gramáticas de seleção
            // na mesma linha: a pessoa lia o lilás como outro tipo de estado,
            // não como "este é o canal ativo".
            className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${
              ativo
                ? "border-2 bg-card/70"
                : disponivel
                  ? "border border-border/80 bg-card/40 hover:bg-card/70"
                  : "border border-border opacity-50"
            }`}
            style={ativo ? { borderColor: channelAccent(canal) } : undefined}
          >
            <HaloSelecao ativo={ativo} cor={channelAccent(canal)} reduzir={reduzir} />
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

export function AnunciosCliente({ periodoServidor, dadosIniciais }: {
  /** Janela de 30 dias calculada no servidor. Vem como prop em vez de ser
   *  recalculada aqui para que a chave do período bata exatamente com a dos
   *  dados pré-buscados — recalcular no navegador poderia cair em outro dia
   *  (fuso do servidor vs. do usuário) e jogar fora a busca já feita. */
  periodoServidor?: { inicio: string; fim: string };
  /** Visão geral do período atual e do anterior, já resolvidas no servidor. */
  dadosIniciais?: { dados: VisaoGeralResultado | null; anterior: VisaoGeralResultado | null } | null;
}) {
  const { canal, pronto: canalPronto } = useCanalAnuncios();
  // Guarda só o que a PESSOA escolheu no calendário. Vazio (o estado inicial,
  // e também o que "Limpar" devolve) significa "use a janela padrão", que é a
  // do canal ativo — assim trocar de canal sem ter escolhido período move a
  // janela junto, e escolher um período uma vez o mantém nos dois canais.
  //
  // Isso também resolve o que o vazio já resolvia antes: sem o fallback, o
  // resto do componente (busca, período anterior) fazia
  // `new Date("T12:00:00")` (Invalid Date) e mandava "NaN-NaN-NaN" pro
  // servidor, quebrando a tela.
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });
  // Âncora do "hoje" vinda do servidor: recalcular no navegador poderia cair
  // em outro dia (fuso do servidor vs. o do usuário) e jogar fora a busca já
  // pré-resolvida no HTML.
  const fimBase = periodoServidor?.fim ?? hojeISO;
  const periodoPadrao = useMemo(() => periodoDoCanal(fimBase, canal), [fimBase, canal]);
  const periodoEfetivo = periodo.inicio && periodo.fim ? periodo : periodoPadrao;
  // O canal entra na chave: trocar de canal precisa invalidar o que está na
  // tela, senão os números do Mercado Livre ficariam visíveis sob o rótulo da
  // Shopee até a busca nova voltar. A chave dos dados pré-buscados descreve o
  // que o SERVIDOR resolveu — canal padrão e a janela dele — e não o que a
  // preferência do navegador vai pedir daqui a um instante.
  const chaveInicial = (() => {
    const doServidor = periodoDoCanal(fimBase, PLATAFORMA_DOS_DADOS_INICIAIS);
    return `${doServidor.inicio}:${doServidor.fim}:${PLATAFORMA_DOS_DADOS_INICIAIS}`;
  })();
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(
    dadosIniciais?.dados?.marcas[0]?.brandId ?? null,
  );
  const [consulta, setConsulta] = useState<{ chave: string; dados: VisaoGeralResultado | null; anterior: VisaoGeralResultado | null }>(
    dadosIniciais?.dados
      ? { chave: chaveInicial, dados: dadosIniciais.dados, anterior: dadosIniciais.anterior }
      : { chave: "", dados: null, anterior: null },
  );
  const dados = consulta.dados;
  const chavePeriodo = `${periodoEfetivo.inicio}:${periodoEfetivo.fim}:${canal}`;
  const carregando = consulta.chave !== chavePeriodo;

  const buscar = useCallback(() => {
    let ativo = true;
    const inicio = new Date(`${periodoEfetivo.inicio}T12:00:00`);
    const fim = new Date(`${periodoEfetivo.fim}T12:00:00`);
    const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1);
    const fimAnterior = new Date(inicio); fimAnterior.setDate(fimAnterior.getDate() - 1);
    const inicioAnterior = new Date(fimAnterior); inicioAnterior.setDate(inicioAnterior.getDate() - (dias - 1));
    Promise.all([
      actionObterVisaoGeralAnuncios({ inicio: periodoEfetivo.inicio, fim: periodoEfetivo.fim, canal }),
      actionObterVisaoGeralAnuncios({ inicio: paraISO(inicioAnterior), fim: paraISO(fimAnterior), canal }),
    ])
      .then(([resultado, anterior]) => {
        if (!ativo) return;
        setConsulta({ chave: chavePeriodo, dados: resultado, anterior });
        // A marca ativa não sobrevive à troca de canal quando ela não anuncia
        // no canal novo (a KARZI não tem Shopee, por exemplo) — cair na
        // primeira marca do resultado é melhor que uma tela vazia.
        setMarcaAtiva((atual) => (
          atual && resultado.marcas.some((marca) => marca.brandId === atual)
            ? atual
            : resultado.marcas[0]?.brandId ?? null
        ));
      })
      .catch(() => { if (ativo) { setConsulta({ chave: chavePeriodo, dados: null, anterior: null }); toast.error(copy.erros.carregar); } });
    return () => { ativo = false; };
  }, [periodoEfetivo.inicio, periodoEfetivo.fim, chavePeriodo, canal]);

  // Quando o servidor já mandou os dados do período inicial, a primeira
  // execução destes efeitos é pulada — ela só refaria no navegador a busca
  // que acabou de chegar dentro do HTML. Trocar o período depois continua
  // caindo aqui normalmente.
  const primeiraBusca = useRef(Boolean(dadosIniciais?.dados));

  useEffect(() => {
    // Espera a preferência de canal ser lida: buscar antes disso faria uma
    // ida ao servidor no canal padrão que seria descartada logo em seguida.
    if (!canalPronto) return;
    if (primeiraBusca.current && canal === PLATAFORMA_DOS_DADOS_INICIAIS) { primeiraBusca.current = false; return; }
    primeiraBusca.current = false;
    return buscar();
  }, [buscar, canal, canalPronto]);

  useAtualizacaoLocal("anuncios", buscar, { fontes: ["anuncios"] });

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
      {/* Mobile: canal em cima, empresas embaixo, Período por último — cada
          grupo com `w-full` para ocupar a própria fileira, e `md:contents`
          desfazendo o agrupamento a partir do md, de volta à fileira única.

          Sem o `w-full`, os dois grupos disputavam a mesma linha e a quebra
          passava a depender de quantas pílulas existiam naquele instante: com
          a Shopee selecionada a KARZI some (ela não opera Shopee), sobravam
          3 canais + 2 empresas, tudo cabia numa fileira só, e o cabeçalho
          mudava de forma conforme o canal escolhido. É o mesmo padrão que
          Campanhas e Histórico já usavam — a página principal ficou de fora
          quando as sub-páginas foram corrigidas. */}
      <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
        {/* Empresas ANTES dos canais na fileira única do desktop, e a ordem
            de sempre preservada no celular (canal em cima, empresa embaixo)
            — pedido de 02/09/2026, o mesmo aplicado ao `ScopeRow` de
            Métricas. `md:contents` dissolve os wrappers a partir do md e aí
            quem manda é a ordem do DOM, por isso as MARCAS vêm escritas
            primeiro; abaixo do md os wrappers voltam a ser itens de flex e o
            `order-*` devolve a leitura do estreito. */}
        <div className="order-2 flex w-full justify-center gap-1.5 md:order-none md:contents">
          <SeletorMarca
            marcas={dados.marcas}
            ativa={marca.brandId}
            onChange={setMarcaAtiva}
            indisponiveis={dados.marcasIndisponiveis}
          />
        </div>
        <div className="order-1 flex w-full justify-center gap-1.5 md:order-none md:contents">
          <SeletorCanalAnuncios />
        </div>
        <span className="hidden h-px flex-1 bg-border md:block" />
        <div className="order-3 flex w-full justify-center md:order-none md:contents">
          <CalendarioPopoverRange
            rotulo="Período"
            valor={periodoEfetivo}
            max={hojeISO}
            onChange={setPeriodo}
            accent={acentoMarca}
          />
        </div>
      </div>

      {/* Risco separador só no mobile, entre o grupo de período
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
      {/* O último atalho, quando o total é ímpar, sobrava numa fileira só pra
          ele e encostado à esquerda — parecia um botão órfão, desalinhado com
          a grade parelha acima. Passa a ocupar as duas colunas e a se centrar
          nelas. Só vale na grade do mobile: do `lg` em diante isto é uma
          fileira flex e não há coluna nenhuma para atravessar. */}
      <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 [&>*:last-child:nth-child(odd)]:justify-self-center lg:flex lg:flex-wrap lg:items-center lg:[&>*:last-child:nth-child(odd)]:col-span-1">
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

      {/* Vem antes dos números, não depois: é o que evita ler a receita dos
          dias mais recentes da Shopee como queda de desempenho. */}
      <AvisoJanela janela={dados.janela} fim={marca.janela.fim} />

      {/* Ato 1 — os quatro números que respondem "o que está acontecendo" */}
      <KpisPrincipais resumo={marca.resumo} plataforma={dados.janela.plataforma} />

      <ComparativoPeriodo atual={marca} anterior={marcaAnterior} dias={Math.max(1, Math.round((new Date(`${periodoEfetivo.fim}T12:00:00`).getTime() - new Date(`${periodoEfetivo.inicio}T12:00:00`).getTime()) / 86_400_000) + 1)} />

      {/* Ato 2 — performance por campanha, a tabela de trabalho */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Campanhas</SectionLabel>
        <CampanhasCard campanhas={marca.campanhas} marca={marca} />
      </section>

      {/* Ato 3 — o que a mídia paga está puxando */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Dependência de mídia</SectionLabel>
        <OrganicoCard resumo={marca.resumo} resumoAnterior={marcaAnterior?.resumo ?? null} marca={marca} plataforma={dados.janela.plataforma} />
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
