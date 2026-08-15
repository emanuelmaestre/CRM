"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Info, LineChart } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterHistoricoDaMarca, actionObterVisaoGeralAnuncios } from "../actions";
import { SeletorMarca } from "../anuncios-cliente";
import { Card, CardHead } from "../anuncios-primitives";
import { Roas } from "../roas";
import type { PontoHistorico } from "@/modules/anuncios/application/historico.service";
import type { VisaoGeralMarca } from "@/modules/anuncios/application/visao-geral.service";

const copy = anunciosConfig.historicoDetalhe;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

const PERIODOS = [7, 30, 90] as const;

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
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      )}
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill={cor} />
      ))}
    </svg>
  );
}

function GraficoHistorico({ pontos }: { pontos: PontoHistorico[] }) {
  const investimento = pontos.map((p, i) => ({ x: i, y: p.investimento }));
  const receita = pontos.map((p, i) => ({ x: i, y: p.receita }));

  return (
    <Card>
      <CardHead title={copy.title} icon={LineChart} accent="var(--acento-2)" />
      <div className="px-4 pb-4 sm:px-5">
        <div className="mb-2 flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-info" /> {copy.grafico.investimento}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> {copy.grafico.receita}</span>
        </div>
        <div className="relative h-40 w-full">
          <div className="absolute inset-0"><GraficoLinha pontos={receita} cor="var(--success)" /></div>
          <div className="absolute inset-0"><GraficoLinha pontos={investimento} cor="var(--info)" /></div>
        </div>
        {pontos.length > 0 && (
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{diaMes.format(new Date(`${pontos[0].data}T00:00:00`))}</span>
            <span>{diaMes.format(new Date(`${pontos[pontos.length - 1].data}T00:00:00`))}</span>
          </div>
        )}
        {pontos.length === 1 && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info size={12} className="mt-0.5 shrink-0" /> {copy.umPontoAviso}
          </p>
        )}
      </div>
    </Card>
  );
}

export function HistoricoClienteDetalhe() {
  const [marcas, setMarcas] = useState<VisaoGeralMarca[] | null>(null);
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);
  const [pontos, setPontos] = useState<PontoHistorico[] | null>(null);
  const [pontosBrandId, setPontosBrandId] = useState<string | null>(null);
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    actionObterVisaoGeralAnuncios()
      .then((resultado) => {
        if (!ativo) return;
        setMarcas(resultado.marcas);
        setMarcaAtiva((atual) => atual ?? resultado.marcas[0]?.brandId ?? null);
      })
      .catch(() => { if (ativo) toast.error(anunciosConfig.erros.carregar); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!marcaAtiva) return;
    let ativo = true;
    actionObterHistoricoDaMarca({ brandId: marcaAtiva, dias })
      .then((resultado) => { if (ativo) { setPontos(resultado); setPontosBrandId(`${marcaAtiva}:${dias}`); } })
      .catch(() => { if (ativo) { toast.error(anunciosConfig.erros.carregar); setPontosBrandId(`${marcaAtiva}:${dias}`); } });
    return () => { ativo = false; };
  }, [marcaAtiva, dias]);

  const carregandoPontos = marcaAtiva !== null && pontosBrandId !== `${marcaAtiva}:${dias}`;

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
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMarca marcas={marcas} ativa={marca.brandId} onChange={setMarcaAtiva} />
        <span className="h-px flex-1 bg-border" />
        <div className="flex gap-1">
          {PERIODOS.map((periodo) => (
            <button
              key={periodo}
              type="button"
              onClick={() => setDias(periodo)}
              className="press-feedback rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: dias === periodo ? "var(--foreground)" : "var(--muted)",
                color: dias === periodo ? "var(--background)" : "var(--muted-foreground)",
              }}
            >
              {copy.periodos[String(periodo) as "7" | "30" | "90"]}
            </button>
          ))}
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
          <GraficoHistorico pontos={pontos} />

          <Card>
            <div className="table-scroll px-1 pb-5 pt-3 sm:px-2">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-medium uppercase text-muted-foreground">
                    {copy.colunas.map((coluna: string, indice: number) => (
                      <th key={coluna} className={`px-3 py-2 ${indice > 0 ? "text-right" : ""}`}>{coluna}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...pontos].reverse().map((ponto, indice, arr) => (
                    <tr key={ponto.data} className={indice < arr.length - 1 ? "border-b border-border" : ""}>
                      <td className="px-3 py-2.5 font-medium text-foreground">{diaMes.format(new Date(`${ponto.data}T00:00:00`))}</td>
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
