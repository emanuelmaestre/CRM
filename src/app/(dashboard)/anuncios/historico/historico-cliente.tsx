"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { CircleAlert, LineChart } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { CalendarioPopoverRange, type RangeDatas } from "@/shared/design-system/primitives/CalendarioPopoverRange";
import { stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterHistoricoDaMarca, actionObterVisaoGeralAnuncios } from "../actions";
import { useCanalAnuncios } from "../canal-anuncios";
import { SeletorCanalAnuncios, SeletorMarca } from "../anuncios-cliente";
import { Card, CardHead, RotuloComInfo } from "../anuncios-primitives";
import { Roas } from "../roas";
import type { PontoHistorico } from "@/modules/anuncios/application/historico.service";
import type { VisaoGeralMarca } from "@/modules/anuncios/application/visao-geral.service";

const copy = anunciosConfig.historicoDetalhe;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const dataCompleta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Pré-selecionado em Hoje, igual ao resto do app — antes vinha em 30 dias.
function periodoPadrao(): RangeDatas {
  const hoje = hojeISO();
  return { inicio: hoje, fim: hoje };
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Gráfico de linha minimalista, sem dependência externa — mesmo espírito
 *  de BarraSimples em anuncios-primitives.tsx: SVG puro, escala local aos
 *  próprios dados. Com 1 ponto só, mostra só o marcador (não dá pra
 *  desenhar uma linha com um ponto, e fingir uma faria a leitura mentir). */
function GraficoLinha({ pontos, cor, largura = 640, altura = 140 }: {
  pontos: Array<{ x: number; y: number }>;
  cor: string;
  largura?: number;
  altura?: number;
}) {
  const reduzirMovimento = useReducedMotion();

  if (pontos.length === 0) return null;

  const valores = pontos.map((p) => p.y);
  const min = Math.min(0, ...valores);
  const max = Math.max(...valores, 1);
  const paddingY = 12;
  const escalaY = (valor: number) => altura - paddingY - ((valor - min) / (max - min || 1)) * (altura - paddingY * 2);
  const escalaX = (indice: number) => (pontos.length <= 1 ? largura / 2 : (indice / (pontos.length - 1)) * largura);

  const coords = pontos.map((p, i) => [escalaX(i), escalaY(p.y)] as const);
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="h-full w-full" preserveAspectRatio="none">
      {pontos.length > 1 && (
        <motion.path
          d={path}
          fill="none"
          stroke={cor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduzirMovimento ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={reduzirMovimento ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        />
      )}
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill={cor} />
      ))}
    </svg>
  );
}

function avisoUmPonto(ponto: PontoHistorico, periodo: RangeDatas) {
  const inicioFmt = dataCompleta.format(new Date(`${periodo.inicio}T00:00:00`));
  const fimFmt = dataCompleta.format(new Date(`${periodo.fim}T00:00:00`));
  return `Só existe 1 dia de dado sincronizado neste filtro (${dataCompleta.format(new Date(`${ponto.data}T00:00:00`))}), embora o período escolhido vá de ${inicioFmt} a ${fimFmt}. A tendência aparece quando houver pelo menos 2 dias sincronizados.`;
}

function GraficoHistorico({ pontos, periodo }: { pontos: PontoHistorico[]; periodo: RangeDatas }) {
  const investimento = pontos.map((p, i) => ({ x: i, y: p.investimento }));
  const receita = pontos.map((p, i) => ({ x: i, y: p.receita }));
  const aviso = pontos.length === 1 ? avisoUmPonto(pontos[0], periodo) : null;

  return (
    <Card>
      <CardHead title={copy.title} subtitle={copy.description} icon={LineChart} accent="var(--acento-2)" />
      <div className="px-4 pb-4 pt-4 sm:px-5">
        <div className="mb-2 flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-info" /> {copy.grafico.investimento}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> {copy.grafico.receita}</span>
        </div>
        <div className="relative h-40 w-full">
          <div className="absolute inset-0"><GraficoLinha pontos={receita} cor="var(--success)" /></div>
          <div className="absolute inset-0"><GraficoLinha pontos={investimento} cor="var(--info)" /></div>
        </div>
        {pontos.length > 0 && (
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>{diaMes.format(new Date(`${pontos[0].data}T00:00:00`))}</span>
            <span>{diaMes.format(new Date(`${pontos[pontos.length - 1].data}T00:00:00`))}</span>
          </div>
        )}
        {aviso && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <span title={aviso} className="mt-0.5 inline-flex shrink-0">
              <CircleAlert aria-hidden="true" size={12} />
            </span>
            {aviso}
          </p>
        )}
      </div>
    </Card>
  );
}

export function HistoricoClienteDetalhe() {
  const [marcas, setMarcas] = useState<VisaoGeralMarca[] | null>(null);
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);
  const { canal } = useCanalAnuncios();
  const [pontos, setPontos] = useState<PontoHistorico[] | null>(null);
  const [pontosBrandId, setPontosBrandId] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<RangeDatas>(periodoPadrao);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    actionObterVisaoGeralAnuncios({ canal })
      .then((resultado) => {
        if (!ativo) return;
        setMarcas(resultado.marcas);
        // Marca que não anuncia no canal novo não pode continuar ativa.
        setMarcaAtiva((atual) => (
          atual && resultado.marcas.some((marca) => marca.brandId === atual)
            ? atual
            : resultado.marcas[0]?.brandId ?? null
        ));
      })
      .catch(() => { if (ativo) toast.error(anunciosConfig.erros.carregar); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [canal]);

  useEffect(() => {
    if (!marcaAtiva || !periodo.inicio || !periodo.fim) return;
    const chave = `${marcaAtiva}:${periodo.inicio}:${periodo.fim}:${canal}`;
    let ativo = true;
    actionObterHistoricoDaMarca({ brandId: marcaAtiva, inicio: periodo.inicio, fim: periodo.fim, canal })
      .then((resultado) => { if (ativo) { setPontos(resultado); setPontosBrandId(chave); } })
      .catch(() => { if (ativo) { toast.error(anunciosConfig.erros.carregar); setPontosBrandId(chave); } });
    return () => { ativo = false; };
  }, [marcaAtiva, periodo, canal]);

  const carregandoPontos = marcaAtiva !== null && pontosBrandId !== `${marcaAtiva}:${periodo.inicio}:${periodo.fim}:${canal}`;

  if (carregando) return <Esqueleto />;

  if (!marcas || marcas.length === 0) {
    return (
      <div className="card-surface">
        <EmptyState illustration="generic" title={anunciosConfig.vazio.titulo} description={anunciosConfig.vazio.descricao} />
      </div>
    );
  }

  const marca = marcas.find((item) => item.brandId === marcaAtiva) ?? marcas[0];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* Mobile: centralizado, com o canal (Mercado Livre) acima e as
          empresas abaixo — `order` inverte só a leitura visual, sem mudar
          o DOM; `md:contents` desfaz o agrupamento a partir do md, voltando
          à fileira única de sempre (marca, canal, Período). */}
      <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
        <div className="order-1 flex w-full justify-center gap-1.5 md:order-none md:contents">
          <SeletorCanalAnuncios />
        </div>
        <div className="order-2 flex w-full justify-center gap-1.5 md:order-none md:contents">
          <SeletorMarca marcas={marcas} ativa={marca.brandId} onChange={setMarcaAtiva} />
        </div>
        <span className="hidden h-px flex-1 bg-border md:block" />
        <div className="order-3 flex w-full justify-center md:order-none md:contents">
          <CalendarioPopoverRange rotulo="Período" valor={periodo} max={hojeISO()} onChange={setPeriodo} />
        </div>
      </div>

      {carregandoPontos || !pontos ? (
        <Skeleton className="h-64 w-full" />
      ) : pontos.length === 0 ? (
        <div className="card-surface">
          <EmptyState illustration="reports" title={copy.vazio} description={copy.vazioDescricao} />
        </div>
      ) : (
        <>
          <GraficoHistorico pontos={pontos} periodo={periodo} />

          <Card>
            <div className="divide-y divide-border px-4 py-2 md:hidden">
              {[...pontos].reverse().map((ponto) => (
                <article key={ponto.data} className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-foreground">{dataCompleta.format(new Date(`${ponto.data}T00:00:00`))}</h4>
                    <Roas valor={ponto.roas} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Investimento</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(ponto.investimento)}</dd></div>
                    <div className="text-right"><dt className="text-xs text-muted-foreground">Receita</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(ponto.receita)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Cliques</dt><dd className="mt-0.5 tabular-nums">{ponto.cliques.toLocaleString("pt-BR")}</dd></div>
                    <div className="text-right"><dt className="text-xs text-muted-foreground">Vendas</dt><dd className="mt-0.5 tabular-nums">{ponto.vendas.toLocaleString("pt-BR")}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="table-scroll hidden px-1 pb-5 pt-3 md:block sm:px-2">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-medium uppercase text-muted-foreground">
                    <th className="whitespace-nowrap px-3 py-2">
                      <RotuloComInfo descricao="O dia a que os números desta linha se referem, dentro do período escolhido. Não é a data de criação de nada, é o dia da sincronização que gerou este ponto do histórico.">{copy.colunas[0]}</RotuloComInfo>
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">
                      <RotuloComInfo descricao="Quanto a marca gastou em mídia paga nesse dia.">{copy.colunas[1]}</RotuloComInfo>
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">
                      <RotuloComInfo descricao="Faturamento atribuído aos anúncios da marca nesse dia. Não é lucro, pois ainda não desconta investimento, custo do produto, frete, taxas ou impostos.">{copy.colunas[2]}</RotuloComInfo>
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">
                      <RotuloComInfo descricao="Receita atribuída dividida pelo investimento nesse dia. Ajuda a comparar retorno entre dias, mas não é margem nem lucro.">{copy.colunas[3]}</RotuloComInfo>
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">
                      <RotuloComInfo descricao="Vezes que clicaram nos anúncios da marca nesse dia.">{copy.colunas[4]}</RotuloComInfo>
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">
                      <RotuloComInfo descricao="Vendas que vieram de anúncios pagos nesse dia. Não conta vendas orgânicas (as que teriam acontecido sem investimento em mídia).">{copy.colunas[5]}</RotuloComInfo>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...pontos].reverse().map((ponto, indice, arr) => (
                    <tr key={ponto.data} className={indice < arr.length - 1 ? "border-b border-border" : ""}>
                      <td className="px-3 py-2.5 font-medium text-foreground">{dataCompleta.format(new Date(`${ponto.data}T00:00:00`))}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(ponto.investimento)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(ponto.receita)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        <Roas valor={ponto.roas} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{ponto.cliques.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{ponto.vendas.toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </motion.div>
  );
}
