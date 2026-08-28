"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { springs, stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterAnunciosDaCampanha, actionObterVisaoGeralAnuncios } from "../actions";
import { useCanalAnuncios } from "../canal-anuncios";
import { SeletorCanalAnuncios, SeletorMarca } from "../anuncios-cliente";
import { Card, RotuloComInfo } from "../anuncios-primitives";
import { Roas } from "../roas";
import type { AnuncioDaCampanha } from "@/modules/anuncios/application/campanha-detalhe.service";
import type { CampanhaVisaoGeral, VisaoGeralMarca, VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";
import type { Diagnostico, SeveridadeDiagnostico } from "@/modules/anuncios/application/motor-diagnostico";
import { tint } from "@/shared/design-system/color";

const copy = anunciosConfig.campanhasDetalhe;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  active: { label: "Ativa", cor: "var(--success)" },
  paused: { label: "Pausada", cor: "var(--warning)" },
};

const COR_SEVERIDADE: Record<SeveridadeDiagnostico, string> = {
  critico: "var(--destructive)",
  atencao: "var(--warning)",
  oportunidade: "var(--success)",
};

function BadgeStatus({ status }: { status: string }) {
  const info = STATUS_LABEL[status] ?? { label: status, cor: "var(--muted-foreground)" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tint(info.cor, 9), color: info.cor }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.cor }} />
      {info.label}
    </span>
  );
}

function LinhaDiagnostico({ diagnostico }: { diagnostico: Diagnostico }) {
  const cor = COR_SEVERIDADE[diagnostico.severidade];
  return (
    <li className="rounded-[0.8rem] border border-border p-3" style={{ borderLeft: `3px solid ${cor}` }}>
      <p className="text-[13px] font-semibold text-foreground">{diagnostico.titulo}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{diagnostico.explicacao}</p>
      <p className="mt-1.5 text-[12px] font-medium" style={{ color: cor }}>{diagnostico.acaoRecomendada}</p>
      {diagnostico.acaoDesencorajada && (
        <p className="mt-1 text-[11px] text-muted-foreground">Não: {diagnostico.acaoDesencorajada}</p>
      )}
    </li>
  );
}

/* "Participação no topo", "Perdida por orçamento", "Perdida por ranking" e
 *  "ACOS benchmark" saíram daqui de propósito: são métricas testadas ao
 *  vivo contra as 3 contas reais (ver mercadolivre-ads.provider.ts) e a
 *  API do Mercado Livre rejeita o pedido com "Field X not allowed" — não é
 *  falta de sincronização, é ausência confirmada nesta superfície da API
 *  hoje. Mostrar "Sem dado" fixo pra sempre é pior do que não mostrar. */
function PainelExposicao({ campanha }: { campanha: CampanhaVisaoGeral }) {
  const percentual = (valor: number | null) => valor === null ? "Sem dado" : `${(Math.abs(valor) <= 1 ? valor * 100 : valor).toFixed(1)}%`;
  const itens: [string, string, string][] = [
    [
      "ROAS objetivo",
      campanha.roasObjetivo === null ? "Sem dado" : `${campanha.roasObjetivo.toFixed(2)}x`,
      "Meta de retorno configurada para a campanha no Mercado Livre (receita esperada por real investido). Não é o ROAS realizado, que fica na coluna Investido/Receita da lista de anúncios.",
    ],
    [
      "Participação de impressão",
      percentual(campanha.impressionShare ?? campanha.sov),
      "De todas as vezes que os anúncios desta campanha poderiam ter aparecido nas buscas do Mercado Livre, em quantas eles realmente apareceram.",
    ],
  ];
  return (
    <dl className="col-span-full grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-3">
      {itens.map(([label, valor, descricao]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] text-muted-foreground"><RotuloComInfo descricao={descricao}>{label}</RotuloComInfo></dt>
          <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function TabelaAnuncios({ anuncios, carregando }: { anuncios: AnuncioDaCampanha[] | null; carregando: boolean }) {
  if (carregando) return <p className="px-1 py-3 text-[12px] text-muted-foreground">{copy.anuncios.carregando}</p>;
  if (!anuncios || anuncios.length === 0) return <p className="px-1 py-3 text-[12px] text-muted-foreground">{copy.anuncios.vazio}</p>;

  return (
    <>
    <div className="divide-y divide-border md:hidden">
      {anuncios.map((anuncio) => (
        <article key={anuncio.itemId} className="py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold leading-snug text-foreground">{anuncio.titulo ?? anuncio.itemId}</p>
            {anuncio.recomendado && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success"><Sparkles size={11} /> {copy.anuncios.recomendado}</span>}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Criado em</dt><dd className="mt-0.5 font-medium tabular-nums">{anuncio.criadoEm ? dataCurta.format(new Date(anuncio.criadoEm)) : "Não informada"}</dd></div>
            <div className="text-right"><dt className="text-xs text-muted-foreground">Investimento</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(anuncio.investimento)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Receita</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(anuncio.receita)}</dd></div>
            <div className="text-right"><dt className="text-xs text-muted-foreground">ROAS</dt><dd className="mt-0.5 font-semibold"><Roas valor={anuncio.roas} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Vendas</dt><dd className="mt-0.5 tabular-nums">{anuncio.vendas.toLocaleString("pt-BR")}</dd></div>
          </dl>
        </article>
      ))}
    </div>
    <div className="table-scroll hidden md:block">
      <table className="w-full min-w-[640px] text-[12px]">
        <thead>
          <tr className="border-b border-border text-left text-[10px] font-medium uppercase text-muted-foreground">
            <th className="whitespace-nowrap px-2 py-1.5">{copy.anuncios.colunas[0]}</th>
            <th className="whitespace-nowrap px-2 py-1.5 text-right">
              <RotuloComInfo descricao="Data em que o anúncio (item) foi criado no Mercado Livre. Não é a data em que ele entrou nesta campanha, é a origem do anúncio em si.">{copy.anuncios.colunas[1]}</RotuloComInfo>
            </th>
            <th className="whitespace-nowrap px-2 py-1.5 text-right">
              <RotuloComInfo descricao="Quanto foi gasto em mídia com este anúncio, nos dados de hoje.">{copy.anuncios.colunas[2]}</RotuloComInfo>
            </th>
            <th className="whitespace-nowrap px-2 py-1.5 text-right">
              <RotuloComInfo descricao="Faturamento atribuído a este anúncio hoje. Não é lucro, pois ainda não desconta investimento, custo do produto, frete, taxas ou impostos.">{copy.anuncios.colunas[3]}</RotuloComInfo>
            </th>
            <th className="whitespace-nowrap px-2 py-1.5 text-right">
              <RotuloComInfo descricao="Receita deste anúncio dividida pelo investimento nele. Ajuda a comparar retorno entre anúncios, mas não é margem nem lucro.">{copy.anuncios.colunas[4]}</RotuloComInfo>
            </th>
            <th className="whitespace-nowrap px-2 py-1.5 text-right">
              <RotuloComInfo descricao="Vezes que clicaram neste anúncio hoje.">{copy.anuncios.colunas[5]}</RotuloComInfo>
            </th>
            <th className="whitespace-nowrap px-2 py-1.5 text-right">
              <RotuloComInfo descricao="Vendas que vieram deste anúncio pago hoje. Não conta vendas orgânicas (as que teriam acontecido sem investimento em mídia).">{copy.anuncios.colunas[6]}</RotuloComInfo>
            </th>
          </tr>
        </thead>
        <tbody>
          {anuncios.map((anuncio, indice) => (
            <tr key={anuncio.itemId} className={indice < anuncios.length - 1 ? "border-b border-border" : ""}>
              <td className="max-w-[240px] truncate px-2 py-2 font-medium text-foreground">
                {anuncio.titulo ?? anuncio.itemId}
                {anuncio.recomendado && (
                  <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold text-success" title={copy.anuncios.recomendado}>
                    <Sparkles size={9} />
                  </span>
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{anuncio.criadoEm ? dataCurta.format(new Date(anuncio.criadoEm)) : "Não informada"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-foreground">{moeda.format(anuncio.investimento)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-foreground">{moeda.format(anuncio.receita)}</td>
              <td className="px-2 py-2 text-right font-semibold">
                <Roas valor={anuncio.roas} />
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{anuncio.cliques.toLocaleString("pt-BR")}</td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{anuncio.vendas.toLocaleString("pt-BR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function LinhaCampanha({ campanha, brandId, expandida, onToggle }: {
  campanha: CampanhaVisaoGeral;
  brandId: string;
  expandida: boolean;
  onToggle: () => void;
}) {
  const { canal } = useCanalAnuncios();
  const [anuncios, setAnuncios] = useState<AnuncioDaCampanha[] | null>(null);
  const carregandoAnuncios = expandida && anuncios === null;
  const reduzir = useReducedMotion();

  useEffect(() => {
    if (!expandida || anuncios !== null) return;
    let ativo = true;
    actionObterAnunciosDaCampanha({ brandId, campanhaId: campanha.campanhaId, canal })
      .then((resultado) => { if (ativo) setAnuncios(resultado); })
      .catch(() => { if (ativo) { toast.error(copy.anuncios.vazio); setAnuncios([]); } });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandida]);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="press-feedback flex w-full items-center gap-3 px-3 py-3 text-left"
        aria-expanded={expandida}
      >
        <ChevronDown size={15} className="shrink-0 text-muted-foreground transition-transform" style={{ transform: expandida ? "rotate(180deg)" : undefined }} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{campanha.nome}</span>
        <BadgeStatus status={campanha.status} />
        {campanha.diagnosticos.length > 0 && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex" style={{ background: tint("var(--warning)", 9), color: "var(--warning)" }}>
            {campanha.diagnosticos.length} sinal{campanha.diagnosticos.length !== 1 ? "is" : ""}
          </span>
        )}
        <span className="hidden w-20 shrink-0 text-right text-[13px] tabular-nums text-muted-foreground sm:block">
          {campanha.criadaEm ? dataCurta.format(new Date(campanha.criadaEm)) : "Não informada"}
        </span>
        <span className="w-24 shrink-0 text-right text-[13px] font-medium tabular-nums text-foreground">{moeda.format(campanha.investimento)}</span>
        <span className="hidden w-16 shrink-0 justify-end text-right text-[13px] font-semibold sm:inline-flex">
          <Roas valor={campanha.roas} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expandida && (
          <motion.div
            initial={reduzir ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduzir ? undefined : { height: 0, opacity: 0 }}
            transition={reduzir ? { duration: 0 } : springs.settleFast}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-4 border-t border-border bg-muted/40 px-3 py-4 lg:grid-cols-2">
              <PainelExposicao campanha={campanha} />
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                  <RotuloComInfo descricao="Regras que cruzam sinais da campanha (cliques, conversão, tendência de CPC) para apontar o que fazer, nunca um número isolado sem contexto.">{copy.diagnostico.titulo}</RotuloComInfo>
                </p>
                {campanha.diagnosticos.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">{copy.semDiagnostico}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {campanha.diagnosticos.map((diagnostico) => (
                      <LinhaDiagnostico key={diagnostico.tipo} diagnostico={diagnostico} />
                    ))}
                  </ul>
                )}
              </div>
              {/* col-span-full: a lista de anúncios precisa da largura inteira
                  do card. Dividindo a linha 50/50 com o Diagnóstico, a tabela
                  (Anúncio/Investido/Receita/ROAS/Cliques/Vendas) não cabia e
                  ganhava barra de rolagem horizontal própria — largura cheia
                  resolve sem precisar cortar coluna. */}
              <div className="col-span-full">
                <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                  <RotuloComInfo descricao="Cada anúncio (item) que compõe esta campanha, com investimento, receita e ROAS individuais, para ver o desempenho item a item dentro da mesma campanha.">{copy.anuncios.titulo}</RotuloComInfo>
                </p>
                <TabelaAnuncios anuncios={anuncios} carregando={carregandoAnuncios} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export function CampanhasClienteDetalhe() {
  const { canal } = useCanalAnuncios();
  const [dados, setDados] = useState<VisaoGeralResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    actionObterVisaoGeralAnuncios({ canal })
      .then((resultado) => {
        if (!ativo) return;
        setDados(resultado);
        // Marca que não anuncia no canal novo não pode continuar ativa.
        setMarcaAtiva((atual) => (
          atual && resultado.marcas.some((marca) => marca.brandId === atual)
            ? atual
            : resultado.marcas[0]?.brandId ?? null
        ));
        // A campanha aberta é do canal anterior — fechar evita mostrar aquele
        // detalhe sob o rótulo do canal novo.
        setExpandida(null);
      })
      .catch(() => { if (ativo) toast.error(anunciosConfig.erros.carregar); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [canal]);

  if (carregando) return <Esqueleto />;

  if (!dados || dados.semDados) {
    return (
      <div className="card-surface">
        <EmptyState illustration="generic" title={anunciosConfig.vazio.titulo} description={anunciosConfig.vazio.descricao} />
      </div>
    );
  }

  const marca: VisaoGeralMarca = dados.marcas.find((item) => item.brandId === marcaAtiva) ?? dados.marcas[0];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* Mobile: "Voltar" e "Atualizado em" dividem a mesma linha — no
          desktop o link mora sozinho lá em cima (ver page.tsx) e o horário
          fica na fileira de filtros, à direita. */}
      <div className="flex items-center justify-between gap-2 md:hidden">
        <Link
          href="/publicidade"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={13} /> {copy.voltar}
        </Link>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw size={11} />
          {marca.sincronizadoEm ? dataHora.format(new Date(marca.sincronizadoEm)) : "Nunca sincronizado"}
        </span>
      </div>

      {/* Mobile: centralizado, com o canal (Mercado Livre) acima e as
          empresas abaixo — `order` inverte só a leitura visual, sem mudar
          o DOM; `md:contents` desfaz o agrupamento a partir do md, voltando
          à fileira única de sempre (marca, canal, horário — que já saiu
          daqui, ver acima). */}
      <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
        <div className="order-1 flex w-full justify-center gap-1.5 md:order-none md:contents">
          <SeletorCanalAnuncios />
        </div>
        <div className="order-2 flex w-full justify-center gap-1.5 md:order-none md:contents">
        {/* A marca que não anuncia neste canal continua na fileira, apagada
            e com o ícone de tomada, em vez de sumir — mesma decisão da Visão
            Geral (some sem explicação, o operador não distingue "não anuncia
            aqui" de "quebrou"). */}
          <SeletorMarca marcas={dados.marcas} ativa={marca.brandId} onChange={(brandId) => { setMarcaAtiva(brandId); setExpandida(null); }} indisponiveis={dados.marcasIndisponiveis} />
        </div>
        <span className="hidden h-px flex-1 bg-border md:block" />
        <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:inline-flex">
          <RefreshCw size={11} />
          {marca.sincronizadoEm ? dataHora.format(new Date(marca.sincronizadoEm)) : "Nunca sincronizado"}
        </span>
      </div>

      <Card>
        {marca.campanhas.length === 0 ? (
          <EmptyState illustration="reports" title={anunciosConfig.campanhas.semDado} />
        ) : (
          <div>
            <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span aria-hidden className="w-[15px] shrink-0" />
              <span className="min-w-0 flex-1">{copy.lista.titulo}</span>
              <span className="hidden w-20 shrink-0 text-right sm:block">{copy.lista.criadaEm}</span>
              <span className="w-24 shrink-0 text-right">
                <RotuloComInfo descricao="Quanto foi gasto em mídia com esta campanha, nos dados de hoje.">{copy.lista.investimento}</RotuloComInfo>
              </span>
              <span className="hidden w-16 shrink-0 justify-end text-right sm:inline-flex">
                <RotuloComInfo descricao="Receita atribuída dividida pelo investimento da campanha, nos dados de hoje. É o retorno realizado, diferente do ROAS objetivo (a meta configurada no Mercado Livre para esta campanha).">{copy.lista.roas}</RotuloComInfo>
              </span>
            </div>
            {marca.campanhas.map((campanha) => (
              <LinhaCampanha
                key={campanha.campanhaId}
                campanha={campanha}
                brandId={marca.brandId}
                expandida={expandida === campanha.campanhaId}
                onToggle={() => setExpandida((atual) => (atual === campanha.campanhaId ? null : campanha.campanhaId))}
              />
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
