"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { springs, stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterAnunciosDaCampanha, actionObterVisaoGeralAnuncios } from "../actions";
import { SeletorMarca } from "../anuncios-cliente";
import { Card } from "../anuncios-primitives";
import { Roas } from "../roas";
import type { AnuncioDaCampanha } from "@/modules/anuncios/application/campanha-detalhe.service";
import type { CampanhaVisaoGeral, VisaoGeralMarca, VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";
import type { Diagnostico, SeveridadeDiagnostico } from "@/modules/anuncios/application/motor-diagnostico";
import { tint } from "@/shared/design-system/color";

const copy = anunciosConfig.campanhasDetalhe;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

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

function TabelaAnuncios({ anuncios, carregando }: { anuncios: AnuncioDaCampanha[] | null; carregando: boolean }) {
  if (carregando) return <p className="px-1 py-3 text-[12px] text-muted-foreground">{copy.anuncios.carregando}</p>;
  if (!anuncios || anuncios.length === 0) return <p className="px-1 py-3 text-[12px] text-muted-foreground">{copy.anuncios.vazio}</p>;

  return (
    <div className="table-scroll">
      <table className="w-full min-w-[560px] text-[12px]">
        <thead>
          <tr className="border-b border-border text-left text-[10px] font-medium uppercase text-muted-foreground">
            {copy.anuncios.colunas.map((coluna: string, indice: number) => (
              <th key={coluna} className={`px-2 py-1.5 ${indice > 0 ? "text-right" : ""}`}>{coluna}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {anuncios.map((anuncio, indice) => (
            <tr key={anuncio.itemId} className={indice < anuncios.length - 1 ? "border-b border-border" : ""}>
              <td className="max-w-[240px] truncate px-2 py-2 font-medium text-foreground">
                {anuncio.titulo ?? anuncio.itemId}
                {anuncio.recomendado && (
                  <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold text-success" title={copy.anuncios.recomendado}>
                    <Sparkles size={9} />
                  </span>
                )}
              </td>
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
  );
}

function LinhaCampanha({ campanha, brandId, expandida, onToggle }: {
  campanha: CampanhaVisaoGeral;
  brandId: string;
  expandida: boolean;
  onToggle: () => void;
}) {
  const [anuncios, setAnuncios] = useState<AnuncioDaCampanha[] | null>(null);
  const lucroPositivo = campanha.lucro.lucroEstimado >= 0;
  const carregandoAnuncios = expandida && anuncios === null;

  useEffect(() => {
    if (!expandida || anuncios !== null) return;
    let ativo = true;
    actionObterAnunciosDaCampanha({ brandId, campanhaId: campanha.campanhaId })
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
        <span className="shrink-0 text-right text-[13px] font-medium tabular-nums text-foreground">{moeda.format(campanha.investimento)}</span>
        <span className="hidden w-16 shrink-0 justify-end text-right text-[13px] font-semibold sm:inline-flex">
          <Roas valor={campanha.roas} minimo={campanha.breakEven.roasMinimo} />
        </span>
        <span className="hidden w-20 shrink-0 text-right text-[13px] font-semibold tabular-nums sm:inline" style={{ color: lucroPositivo ? "var(--success)" : "var(--destructive)" }}>
          {moeda.format(campanha.lucro.lucroEstimado)}{campanha.lucro.custosIncompletos && "*"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expandida && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springs.settleFast}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-4 border-t border-border bg-muted/40 px-3 py-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">{copy.diagnostico.titulo}</p>
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
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">{copy.anuncios.titulo}</p>
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
  const [dados, setDados] = useState<VisaoGeralResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

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

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMarca marcas={dados.marcas} ativa={marca.brandId} onChange={(brandId) => { setMarcaAtiva(brandId); setExpandida(null); }} />
        <span className="h-px flex-1 bg-border" />
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw size={11} />
          {marca.dataSnapshot ? diaMesAno.format(new Date(`${marca.dataSnapshot}T00:00:00`)) : "—"}
        </span>
      </div>

      <Card>
        {marca.campanhas.length === 0 ? (
          <EmptyState illustration="reports" title={anunciosConfig.campanhas.semDado} />
        ) : (
          <div>
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
