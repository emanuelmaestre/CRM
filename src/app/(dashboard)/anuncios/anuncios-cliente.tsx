"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { FileText, RefreshCw } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { CalendarioPopover } from "@/shared/design-system/primitives/CalendarioPopover";
import { isBrandSlug } from "@/shared/config/brands";
import { springs, stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterVisaoGeralAnuncios } from "./actions";
import { CampanhasCard } from "./campanhas-card";
import { KpisPrincipais } from "./kpis-principais";
import { OrganicoCard } from "./organico-card";
import { RotuloComInfo, SectionLabel } from "./anuncios-primitives";
import { exportarAnunciosPDF } from "./exportar-pdf";
import type { VisaoGeralMarca, VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";

const copy = anunciosConfig;

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR");
const decimal1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
// Só para "última sincronização" — diferente de diaMesAno (usado no rótulo
// do período), essa precisa da hora: dataSnapshot é só o dia, sincronizadoEm
// é o instante real em que o job rodou.
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const roasTexto = (valor: number | null) => valor === null ? "sem dado" : `${decimal2.format(valor)}x`;
const variacaoTexto = (valor: number) => `${valor >= 0 ? "+" : ""}${decimal1.format(valor)}%`;
const periodoAnteriorTexto = (dias: number) => dias === 1 ? "o dia anterior" : `os ${dias} dias anteriores`;
const periodoAnteriorComPreposicao = (dias: number) => dias === 1 ? "no dia anterior" : `nos ${dias} dias anteriores`;
const paraISO = (data: Date) => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
const hojeISO = paraISO(new Date());
function periodoInicial() {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 29);
  return { inicio: paraISO(inicio), fim: paraISO(fim) };
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
    ? "O gasto em mídia aumentou; confira se Receita Ads, conversões e ROAS cresceram junto."
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
  const observacao = "Receita Ads é a receita que a plataforma atribuiu aos anúncios. Não é receita total da marca e não é lucro: ainda não desconta mídia, custo do produto, taxas, frete ou impostos.";
  const atualTexto = moeda.format(atual);

  if (anterior === null) {
    return {
      descricao: `Receita Ads atual: ${atualTexto}. Ainda não há período anterior carregado para comparar com ${periodoAnteriorTexto(dias)}. Use este valor junto com investimento e ROAS para entender o retorno da mídia paga.`,
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
export function SeletorMarca({ marcas, ativa, onChange }: {
  marcas: VisaoGeralMarca[];
  ativa: string | null;
  onChange: (brandId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-[0.9rem] bg-muted p-1" role="tablist">
      {marcas.map((marca) => {
        const selecionada = marca.brandId === ativa;
        return (
          <button
            key={marca.brandId}
            type="button"
            role="tab"
            aria-selected={selecionada}
            onClick={() => onChange(marca.brandId)}
            className="press-feedback relative flex h-11 items-center gap-1.5 rounded-[0.7rem] px-3.5 text-xs font-semibold transition-colors"
            style={{ color: selecionada ? "var(--foreground)" : "var(--muted-foreground)" }}
          >
            {selecionada && (
              <motion.span
                layoutId="anuncios-marca"
                transition={springs.settleFast}
                className="absolute inset-0 rounded-[0.7rem] bg-card shadow-[0_1px_4px_rgba(14,15,19,.10)]"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {isBrandSlug(marca.brandSlug) ? <BrandLogo brand={marca.brandSlug} height={14} /> : marca.brandLabel}
            </span>
          </button>
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

export function AnunciosCliente() {
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [consulta, setConsulta] = useState<{ chave: string; dados: VisaoGeralResultado | null; anterior: VisaoGeralResultado | null }>({ chave: "", dados: null, anterior: null });
  const [exportando, setExportando] = useState(false);
  const dados = consulta.dados;
  const chavePeriodo = `${periodo.inicio}:${periodo.fim}`;
  const carregando = consulta.chave !== chavePeriodo;

  useEffect(() => {
    let ativo = true;
    const inicio = new Date(`${periodo.inicio}T12:00:00`);
    const fim = new Date(`${periodo.fim}T12:00:00`);
    const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1);
    const fimAnterior = new Date(inicio); fimAnterior.setDate(fimAnterior.getDate() - 1);
    const inicioAnterior = new Date(fimAnterior); inicioAnterior.setDate(inicioAnterior.getDate() - (dias - 1));
    Promise.all([
      actionObterVisaoGeralAnuncios({ inicio: periodo.inicio, fim: periodo.fim }),
      actionObterVisaoGeralAnuncios({ inicio: paraISO(inicioAnterior), fim: paraISO(fimAnterior) }),
    ])
      .then(([resultado, anterior]) => {
        if (!ativo) return;
        setConsulta({ chave: chavePeriodo, dados: resultado, anterior });
        setMarcaAtiva((atual) => atual ?? resultado.marcas[0]?.brandId ?? null);
      })
      .catch(() => { if (ativo) { setConsulta({ chave: chavePeriodo, dados: null, anterior: null }); toast.error(copy.erros.carregar); } });
    return () => { ativo = false; };
  }, [periodo.inicio, periodo.fim, chavePeriodo]);

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

  async function exportar() {
    setExportando(true);
    try {
      await exportarAnunciosPDF(marca, `${diaMesAno.format(new Date(`${periodo.inicio}T12:00:00`))} a ${diaMesAno.format(new Date(`${periodo.fim}T12:00:00`))}`);
      toast.success("PDF de Anúncios gerado.");
    } catch {
      toast.error("Não foi possível gerar o PDF de Anúncios.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* Header — marca + última sincronização, sempre visível: nunca deixar
          o usuário pensar que o número é em tempo real quando não é. */}
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMarca marcas={dados.marcas} ativa={marca.brandId} onChange={setMarcaAtiva} />
        <div className="flex flex-wrap items-end gap-2" aria-label="Período dos anúncios">
          <CalendarioPopover rotulo="De:" valor={periodo.inicio} max={periodo.fim || hojeISO} onChange={(inicio) => setPeriodo((atual) => ({ ...atual, inicio }))} disabled={carregando} />
          <CalendarioPopover rotulo="Até:" valor={periodo.fim} min={periodo.inicio} max={hojeISO} onChange={(fim) => setPeriodo((atual) => ({ ...atual, fim }))} disabled={carregando} atraso={0.04} />
        </div>
        <span className="h-px flex-1 bg-border" />
        <button type="button" onClick={exportar} disabled={exportando}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
          <FileText size={14} /> {exportando ? "Gerando…" : "Exportar PDF"}
        </button>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw size={11} />
          {copy.header.eyebrow}: {marca.sincronizadoEm ? dataHora.format(new Date(marca.sincronizadoEm)) : "—"}
        </span>
      </div>

      {/* Ato 1 — os quatro números que respondem "o que está acontecendo" */}
      <KpisPrincipais resumo={marca.resumo} />

      <ComparativoPeriodo atual={marca} anterior={marcaAnterior} dias={Math.max(1, Math.round((new Date(`${periodo.fim}T12:00:00`).getTime() - new Date(`${periodo.inicio}T12:00:00`).getTime()) / 86_400_000) + 1)} />

      {/* Ato 2 — performance por campanha, a tabela de trabalho */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2 px-1">
          <h2 className="text-label-md uppercase text-muted-foreground">Campanhas</h2>
          <span className="h-px flex-1 bg-border" />
          <Link href="/anuncios/produtos" className="shrink-0 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            Ver produtos →
          </Link>
          <Link href="/anuncios/historico" className="shrink-0 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            Ver histórico →
          </Link>
          {dados.marcas.length >= 2 && (
            <Link href="/anuncios/comparacao" className="shrink-0 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
              Comparar marcas →
            </Link>
          )}
          <Link href="/anuncios/campanhas" className="shrink-0 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            {copy.campanhas.verTodas} →
          </Link>
        </div>
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
      label: "Investimento",
      descricao: comparacaoInvestimento.descricao,
      observacao: comparacaoInvestimento.observacao,
      valor: variacao(atual.resumo.investimentoTotal, investimentoAnterior ?? 0),
    },
    {
      label: "Receita Ads",
      descricao: comparacaoReceitaAds.descricao,
      observacao: comparacaoReceitaAds.observacao,
      valor: variacao(atual.resumo.receitaTotal, receitaAnterior ?? 0),
    },
    {
      label: "ROAS",
      descricao: comparacaoRoas.descricao,
      observacao: comparacaoRoas.observacao,
      valor: variacaoRoas(atual.resumo.roasMedio, roasAnterior),
    },
    {
      label: "Conversões",
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
