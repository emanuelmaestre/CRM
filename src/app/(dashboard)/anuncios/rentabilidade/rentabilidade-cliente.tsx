"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertCircle, RefreshCw } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterVisaoGeralAnuncios } from "../actions";
import { SeletorMarca } from "../anuncios-cliente";
import { Card } from "../anuncios-primitives";
import { Roas } from "../roas";
import type { StatusBreakEven } from "@/modules/anuncios/application/metricas-calculadas";
import type { CampanhaVisaoGeral, VisaoGeralMarca, VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";
import { tint } from "@/shared/design-system/color";

const copy = anunciosConfig.rentabilidadeDetalhe;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const COR_STATUS: Record<StatusBreakEven, string> = {
  rentavel: "var(--success)",
  no_limite: "var(--warning)",
  nao_rentavel: "var(--destructive)",
  indeterminado: "var(--muted-foreground)",
};

function BadgeStatus({ status }: { status: StatusBreakEven }) {
  const cor = COR_STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tint(cor, 9), color: cor }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
      {copy.status[status]}
    </span>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function ResumoRentabilidade({ campanhas }: { campanhas: CampanhaVisaoGeral[] }) {
  const lucroTotal = Math.round(campanhas.reduce((soma, c) => soma + c.lucro.lucroEstimado, 0) * 100) / 100;
  const contagem: Record<StatusBreakEven, number> = { rentavel: 0, no_limite: 0, nao_rentavel: 0, indeterminado: 0 };
  for (const campanha of campanhas) contagem[campanha.breakEven.status] += 1;

  return (
    <Card className="p-4 sm:p-5">
      <p className="text-xs font-medium uppercase text-muted-foreground">{copy.resumo.lucroTotal}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: lucroTotal >= 0 ? "var(--success)" : "var(--destructive)" }}>
        {moeda.format(lucroTotal)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["rentavel", "no_limite", "nao_rentavel", "indeterminado"] as const).map((status) => (
          <div key={status} className="rounded-[0.8rem] border border-border p-2.5">
            <p className="text-[11px] font-medium" style={{ color: COR_STATUS[status] }}>{copy.status[status]}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{contagem[status]}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function RentabilidadeClienteDetalhe() {
  const [dados, setDados] = useState<VisaoGeralResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    actionObterVisaoGeralAnuncios()
      .then((resultado) => {
        if (!ativo) return;
        setDados(resultado);
        setMarcaAtiva((atual) => atual ?? resultado.marcas[0]?.brandId ?? null);
      })
      .catch(() => { if (ativo) toast.error(anunciosConfig.erros.carregar); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  if (carregando) return <Esqueleto />;

  if (!dados || dados.semDados) {
    return (
      <div className="card-surface">
        <EmptyState illustration="generic" title={anunciosConfig.vazio.titulo} description={anunciosConfig.vazio.descricao} />
      </div>
    );
  }

  const marca: VisaoGeralMarca = dados.marcas.find((item) => item.brandId === marcaAtiva) ?? dados.marcas[0];
  const campanhas = [...marca.campanhas].sort((a, b) => b.lucro.lucroEstimado - a.lucro.lucroEstimado);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMarca marcas={dados.marcas} ativa={marca.brandId} onChange={setMarcaAtiva} />
        <span className="h-px flex-1 bg-border" />
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw size={11} />
          {marca.dataSnapshot ? diaMesAno.format(new Date(`${marca.dataSnapshot}T00:00:00`)) : "—"}
        </span>
      </div>

      {campanhas.length === 0 ? (
        <div className="card-surface">
          <EmptyState illustration="reports" title={copy.vazio} />
        </div>
      ) : (
        <>
          <ResumoRentabilidade campanhas={campanhas} />

          {campanhas.some((c) => c.lucro.custosIncompletos) && (
            <p className="flex items-start gap-1.5 rounded-[0.8rem] border border-border bg-muted/40 px-3 py-2.5 text-[12px] text-muted-foreground">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {copy.avisoCustos}
            </p>
          )}

          <Card>
            <div className="overflow-x-auto px-1 pb-5 pt-3 sm:px-2">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-medium uppercase text-muted-foreground">
                    {copy.colunas.map((coluna: string, indice: number) => (
                      <th key={coluna} className={`px-3 py-2 ${indice > 1 ? "text-right" : ""}`}>{coluna}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campanhas.map((campanha, indice) => {
                    const lucroPositivo = campanha.lucro.lucroEstimado >= 0;
                    return (
                      <tr key={campanha.campanhaId} className={indice < campanhas.length - 1 ? "border-b border-border" : ""}>
                        <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-foreground">{campanha.nome}</td>
                        <td className="px-3 py-2.5"><BadgeStatus status={campanha.breakEven.status} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(campanha.receita)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(campanha.investimento)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          <Roas valor={campanha.breakEven.roasAtual} minimo={campanha.breakEven.roasMinimo} />
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {campanha.breakEven.roasMinimo === null ? "—" : `${campanha.breakEven.roasMinimo.toFixed(2)}x`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {campanha.lucro.margemPercentual === null ? "—" : `${campanha.lucro.margemPercentual.toFixed(1)}%`}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right font-semibold tabular-nums"
                          style={{ color: lucroPositivo ? "var(--success)" : "var(--destructive)" }}
                          title={campanha.lucro.custosIncompletos ? `${copy.custosAusentes}${campanha.lucro.custosAusentes.join(", ")}` : undefined}
                        >
                          {moeda.format(campanha.lucro.lucroEstimado)}{campanha.lucro.custosIncompletos && "*"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </motion.div>
  );
}
