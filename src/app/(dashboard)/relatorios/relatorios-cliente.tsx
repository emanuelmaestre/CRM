"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence, useReducedMotion, useSpring, useTransform } from "framer-motion";
import {
  Wallet, ShoppingBag, Radio, Sparkles, Download, FileSpreadsheet, FileText,
  BarChart2, CheckCircle2, AlertTriangle, ArrowRight, ThumbsUp, ThumbsDown,
  TrendingUp, TrendingDown, Lightbulb,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  actionRelatorioVendas,
  actionListarSugestoes,
  actionListarInsights,
  actionConsumIA,
  actionAprovarSugestao,
  actionRejeitarSugestao,
  actionGerarDocumentoExecutivo,
  actionListarMarcasRelatorio,
} from "./actions";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { springs, stagger, fadeUp } from "@/shared/design-system/motion-variants";
import reportsConfig from "@/config/reports.json";

type RelatorioVendas = Awaited<ReturnType<typeof actionRelatorioVendas>>;
type Sugestao = Awaited<ReturnType<typeof actionListarSugestoes>>[number];
type Insight = Awaited<ReturnType<typeof actionListarInsights>>[number];
type ConsumoIA = Awaited<ReturnType<typeof actionConsumIA>>;
type DocExecutivo = Awaited<ReturnType<typeof actionGerarDocumentoExecutivo>>;

const CANAL_LABEL: Record<string, string> = reportsConfig.channels;
const STATUS_SUGESTAO: Record<string, { label: string; color: string }> = reportsConfig.suggestionStatus;
const CANAL_COR = "#9B30D9";

function formatarBRL(valor: string | number | null | undefined): string {
  const n = parseFloat(String(valor ?? 0));
  return n.toLocaleString(reportsConfig.locale, { style: "currency", currency: reportsConfig.currency });
}

// Sobe de 0 até o valor final quando o número muda — dá vida aos KPIs sem
// exigir nenhuma lib de gráfico só pra isso.
function NumeroAnimado({ valor, formatar }: { valor: number; formatar: (n: number) => string }) {
  const reduzir = useReducedMotion();
  const spring = useSpring(reduzir ? valor : 0, { stiffness: 90, damping: 20 });
  const texto = useTransform(spring, (v) => formatar(v));
  const [exibido, setExibido] = useState(() => formatar(reduzir ? valor : 0));

  useEffect(() => { spring.set(valor); }, [valor, spring]);
  useEffect(() => texto.on("change", setExibido), [texto]);

  return <>{exibido}</>;
}

const KPI_VISUAL: Array<{ icon: LucideIcon; accent: string }> = [
  { icon: Wallet, accent: "#10B981" },
  { icon: ShoppingBag, accent: "#2563EB" },
  { icon: Radio, accent: "#9B30D9" },
  { icon: Sparkles, accent: "#F59E0B" },
];

const INSIGHT_PALAVRAS_ALERTA = /baixa|queda|caiu|risco|cancelad|abandon|comprometem/i;
const INSIGHT_PALAVRAS_POSITIVAS = /alta|crescimento|recorde|melhor|subiu|aument/i;

function classificarInsight(texto: string): { icon: LucideIcon; cor: string } {
  if (INSIGHT_PALAVRAS_ALERTA.test(texto)) return { icon: TrendingDown, cor: "#C21820" };
  if (INSIGHT_PALAVRAS_POSITIVAS.test(texto)) return { icon: TrendingUp, cor: "#10B981" };
  return { icon: Lightbulb, cor: "#9B30D9" };
}

async function exportarXLSX(dados: RelatorioVendas, totalReceita: number) {
  const { default: writeXlsxFile } = await import("write-excel-file");
  const linhas = [
    [reportsConfig.exports.columns[0], reportsConfig.exports.columns[1], reportsConfig.exports.xlsxRevenueColumn, reportsConfig.exports.columns[3]],
    ...dados.porCanal.map((r) => {
      const receita = parseFloat(String(r.receita ?? 0));
      const pct = totalReceita > 0 ? ((receita / totalReceita) * 100).toFixed(1) : "0.0";
      return [CANAL_LABEL[r.canal] ?? r.canal, Number(r.total), receita, pct + "%"];
    }),
    [],
    [reportsConfig.exports.totalLabel, dados.porCanal.reduce((s, r) => s + Number(r.total), 0), totalReceita, "100%"],
  ];
  await writeXlsxFile(
    linhas.map((linha) => linha.map((value) => ({ value }))),
    {
      fileName: `${reportsConfig.exports.filePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheet: reportsConfig.exports.sheetName,
    },
  );
}

async function exportarPDF(dados: RelatorioVendas, totalReceita: number, totalPedidos: number) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const hoje = new Date().toLocaleDateString(reportsConfig.locale);

  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.text(reportsConfig.exports.title, 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Período: ${dados.periodo}  |  ${reportsConfig.exports.generatedAt}: ${hoje}`, 14, 28);

  doc.setFontSize(12);
  doc.setTextColor(40);
  doc.text(`${reportsConfig.exports.kpis[0]}: ${formatarBRL(totalReceita)}`, 14, 40);
  doc.text(`${reportsConfig.exports.kpis[1]}: ${totalPedidos}`, 14, 47);
  doc.text(`${reportsConfig.exports.kpis[2]}: ${dados.porCanal.length}`, 14, 54);

  autoTable(doc, {
    startY: 62,
    head: [reportsConfig.exports.columns],
    body: dados.porCanal.map((r) => {
      const receita = parseFloat(String(r.receita ?? 0));
      const pct = totalReceita > 0 ? ((receita / totalReceita) * 100).toFixed(1) + "%" : "0%";
      return [CANAL_LABEL[r.canal] ?? r.canal, String(r.total), formatarBRL(receita), pct];
    }),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [155, 48, 217] },
  });

  doc.save(`${reportsConfig.exports.filePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarCSV(dados: RelatorioVendas) {
  const linhas = [
    reportsConfig.exports.columns.slice(0, 3),
    ...dados.porCanal.map((r) => [CANAL_LABEL[r.canal] ?? r.canal, String(r.total), String(r.receita ?? 0)]),
  ];
  const csv = linhas.map((l) => l.join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reportsConfig.exports.filePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RelatoriosCliente() {
  const [vendas, setVendas] = useState<RelatorioVendas | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [consumoIA, setConsumoIA] = useState<ConsumoIA | null>(null);
  const [docExecutivo, setDocExecutivo] = useState<DocExecutivo | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerandoDoc, setGerandoDoc] = useState(false);
  const [dias, setDias] = useState(30);
  const [brandId, setBrandId] = useState("");
  const [marcas, setMarcas] = useState<Awaited<ReturnType<typeof actionListarMarcasRelatorio>>>([]);
  const [, startTransition] = useTransition();
  const reduzir = useReducedMotion();
  const docRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback((filtroDias: number, filtroBrandId: string) => {
    startTransition(async () => {
      setLoading(true);
      try {
        const [v, s, i, c] = await Promise.all([
          actionRelatorioVendas({ dias: filtroDias, brandId: filtroBrandId || undefined }),
          actionListarSugestoes(),
          actionListarInsights(),
          actionConsumIA(),
        ]);
        setVendas(v);
        setSugestoes(s);
        setInsights(i);
        setConsumoIA(c);
      } catch {
        toast.error(reportsConfig.messages.loadError);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregar(dias, brandId); }, [carregar, dias, brandId]);
  useEffect(() => {
    actionListarMarcasRelatorio().then(setMarcas).catch(() => setMarcas([]));
  }, []);

  async function aprovar(id: string) {
    try {
      await actionAprovarSugestao(id);
      toast.success(reportsConfig.messages.approveSuccess);
      carregar(dias, brandId);
    } catch {
      toast.error(reportsConfig.messages.approveError);
    }
  }

  async function rejeitar(id: string) {
    try {
      await actionRejeitarSugestao(id, reportsConfig.suggestions.rejectionReason);
      toast.success(reportsConfig.messages.rejectSuccess);
      carregar(dias, brandId);
    } catch {
      toast.error(reportsConfig.messages.rejectError);
    }
  }

  async function gerarDocumento() {
    if (!process.env.NEXT_PUBLIC_OPENAI_DISPONIVEL && !vendas) return;
    setGerandoDoc(true);
    try {
      const doc = await actionGerarDocumentoExecutivo();
      setDocExecutivo(doc);
      toast.success(reportsConfig.messages.documentSuccess);
      requestAnimationFrame(() => docRef.current?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "nearest" }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : reportsConfig.messages.documentError;
      toast.error(msg);
    } finally {
      setGerandoDoc(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <motion.div
          animate={reduzir ? undefined : { rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
          className="w-9 h-9 rounded-full border-[3px] border-muted"
          style={{ borderTopColor: "#9B30D9" }}
        />
        <p className="text-sm text-muted-foreground">{reportsConfig.messages.loading}</p>
      </div>
    );
  }

  const totalReceita = vendas?.porCanal.reduce((s, r) => s + parseFloat(String(r.receita ?? 0)), 0) ?? 0;
  const totalPedidos = vendas?.porCanal.reduce((s, r) => s + Number(r.total), 0) ?? 0;
  const aiBudgetAlert = consumoIA?.alerta
    ? reportsConfig.aiBudgetAlert
      .replace("{alert}", consumoIA.alerta)
      .replace("{budget}", String(consumoIA.orcamentoUsd))
    : null;

  const kpis = [
    { label: reportsConfig.kpis[0], valor: totalReceita, formatar: (n: number) => formatarBRL(n) },
    { label: reportsConfig.kpis[1], valor: totalPedidos, formatar: (n: number) => String(Math.round(n)) },
    { label: reportsConfig.kpis[2], valor: vendas?.porCanal.length ?? 0, formatar: (n: number) => String(Math.round(n)) },
  ];

  return (
    <motion.div
      variants={reduzir ? undefined : stagger}
      initial={reduzir ? undefined : "hidden"}
      animate={reduzir ? undefined : "show"}
      className="space-y-6"
    >
      {/* Filtros */}
      <motion.div variants={reduzir ? undefined : fadeUp} className="flex flex-wrap gap-3" data-testid="relatorios-filtros">
        <select
          value={dias}
          onChange={(event) => setDias(Number(event.target.value))}
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {reportsConfig.filters.periods.map((p) => (
            <option key={p.dias} value={p.dias}>{p.label}</option>
          ))}
        </select>
        <select
          value={brandId}
          onChange={(event) => setBrandId(event.target.value)}
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{reportsConfig.filters.allBrands}</option>
          {marcas.map((marca) => <option key={marca.id} value={marca.id}>{marca.name}</option>)}
        </select>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpis.map((k, i) => {
          const visual = KPI_VISUAL[i];
          const Icon = visual.icon;
          return (
            <motion.div
              key={k.label}
              variants={reduzir ? undefined : fadeUp}
              whileHover={{ y: -2, boxShadow: "0 8px 28px rgba(14,15,19,.1)" }}
              className="relative overflow-hidden rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] p-4"
            >
              <div
                className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-[0.08]"
                style={{ background: visual.accent }}
                aria-hidden="true"
              />
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
                style={{ background: `${visual.accent}18`, color: visual.accent }}
              >
                <Icon size={15} strokeWidth={2} />
              </div>
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold text-foreground mt-0.5 tabular-nums">
                <NumeroAnimado valor={k.valor} formatar={k.formatar} />
              </p>
            </motion.div>
          );
        })}

        <motion.div
          variants={reduzir ? undefined : fadeUp}
          whileHover={{ y: -2, boxShadow: "0 8px 28px rgba(14,15,19,.1)" }}
          className="relative overflow-hidden rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] p-4"
        >
          <div
            className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-[0.08]"
            style={{ background: KPI_VISUAL[3].accent }}
            aria-hidden="true"
          />
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
            style={{ background: `${KPI_VISUAL[3].accent}18`, color: KPI_VISUAL[3].accent }}
          >
            <Sparkles size={15} strokeWidth={2} />
          </div>
          <p className="text-xs text-muted-foreground">{reportsConfig.kpis[3]}</p>
          <p className="text-xl font-bold text-foreground mt-0.5 tabular-nums">
            {consumoIA ? `${consumoIA.percentual}%` : "—"}
          </p>
          {consumoIA && (
            <>
              <p className="text-[11px] text-muted-foreground tabular-nums">${consumoIA.consumoAtualUsd.toFixed(3)}</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(consumoIA.percentual, 100)}%` }}
                  transition={springs.settle}
                  className="h-full rounded-full"
                  style={{ background: consumoIA.percentual > 80 ? "#C21820" : "var(--gradient-signature)" }}
                />
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Alerta consumo IA */}
      <AnimatePresence>
        {consumoIA?.alerta && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2.5 rounded-[1rem] border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400"
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{aiBudgetAlert}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vendas por canal */}
      <motion.div variants={reduzir ? undefined : fadeUp}>
        <SectionCard
          title={reportsConfig.sales.title}
          description={reportsConfig.sales.period}
          icon={BarChart2}
          actions={vendas && vendas.porCanal.length > 0 && (
            <>
              <button
                onClick={() => exportarCSV(vendas)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[0.5rem] border border-border hover:bg-muted transition-colors"
              >
                <Download size={12} /> {reportsConfig.exportActions[0]}
              </button>
              <button
                onClick={() => exportarXLSX(vendas, totalReceita)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[0.5rem] border border-border hover:bg-muted transition-colors"
              >
                <FileSpreadsheet size={12} /> {reportsConfig.exportActions[1]}
              </button>
              <button
                onClick={() => exportarPDF(vendas, totalReceita, totalPedidos)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[0.5rem] border border-border hover:bg-muted transition-colors"
              >
                <FileText size={12} /> {reportsConfig.exportActions[2]}
              </button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={gerarDocumento}
                disabled={gerandoDoc}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[0.5rem] text-white font-medium disabled:opacity-50 transition-opacity"
                style={{ background: "var(--gradient-signature)" }}
              >
                <Sparkles size={12} /> {gerandoDoc ? reportsConfig.executiveDocument.generating : reportsConfig.executiveDocument.action}
              </motion.button>
            </>
          )}
        >
          {!vendas || vendas.porCanal.length === 0 ? (
            <EmptyState title={reportsConfig.sales.empty} illustration="reports" />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {reportsConfig.exports.columns.map((column, index) => (
                      <th key={column} className={`${index === 0 ? "text-left" : "text-right"} pb-3 text-xs font-medium text-muted-foreground`}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendas.porCanal.map((r, i) => {
                    const receita = parseFloat(String(r.receita ?? 0));
                    const pctNum = totalReceita > 0 ? (receita / totalReceita) * 100 : 0;
                    return (
                      <motion.tr
                        key={r.canal}
                        variants={reduzir ? undefined : fadeUp}
                        className={i < vendas.porCanal.length - 1 ? "border-b border-border" : ""}
                      >
                        <td className="py-3 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <ChannelLogo canal={r.canal} size="xs" variant="logo" />
                            {CANAL_LABEL[r.canal] ?? r.canal}
                          </div>
                        </td>
                        <td className="py-3 text-right text-muted-foreground tabular-nums">{String(r.total)}</td>
                        <td className="py-3 text-right font-medium text-foreground tabular-nums">{formatarBRL(receita)}</td>
                        <td className="py-3 text-right w-36">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-muted-foreground tabular-nums text-xs">{pctNum.toFixed(1)}%</span>
                            <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pctNum}%` }}
                                transition={springs.settle}
                                className="h-full rounded-full"
                                style={{ background: CANAL_COR }}
                              />
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </motion.div>

      {/* Documento Executivo IA */}
      <AnimatePresence>
        {docExecutivo && (
          <motion.div
            ref={docRef}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springs.settle}
          >
            <SectionCard
              title={docExecutivo.titulo}
              description={reportsConfig.executiveDocument.generatedCaption}
              icon={FileText}
            >
              <div className="space-y-5">
                <p className="text-sm text-foreground leading-relaxed">{docExecutivo.resumo}</p>
                {docExecutivo.destaques.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-500" /> {reportsConfig.executiveDocument.sections.highlights}</p>
                    <ul className="space-y-1.5">
                      {docExecutivo.destaques.map((d, i) => (
                        <li key={i} className="text-xs text-foreground flex gap-2 rounded-lg bg-emerald-500/8 px-3 py-2">
                          <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-[1px]" />{d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {docExecutivo.alertas.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5"><AlertTriangle size={13} className="text-amber-500" /> {reportsConfig.executiveDocument.sections.alerts}</p>
                    <ul className="space-y-1.5">
                      {docExecutivo.alertas.map((a, i) => (
                        <li key={i} className="text-xs text-foreground flex gap-2 rounded-lg bg-amber-500/8 px-3 py-2">
                          <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-[1px]" />{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {docExecutivo.recomendacoes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5"><ArrowRight size={13} style={{ color: "#9B30D9" }} /> {reportsConfig.executiveDocument.sections.recommendations}</p>
                    <ul className="space-y-1.5">
                      {docExecutivo.recomendacoes.map((r, i) => (
                        <li key={i} className="text-xs text-foreground flex gap-2 rounded-lg px-3 py-2" style={{ background: "#9B30D914" }}>
                          <ArrowRight size={13} className="shrink-0 mt-[1px]" style={{ color: "#9B30D9" }} />{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
                  {reportsConfig.executiveDocument.disclaimer}
                </p>
              </div>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Insights de funil */}
      <motion.div variants={reduzir ? undefined : fadeUp}>
        <SectionCard title={reportsConfig.insights.title} description={reportsConfig.insights.description} icon={Lightbulb}>
          {insights.length === 0 ? (
            <EmptyState title="Nenhum insight ainda" description="A IA gera análises de funil automaticamente conforme os dados do período chegam." illustration="generic" />
          ) : (
            <div className="space-y-2.5">
              {insights.map((ins) => {
                const { icon: Icon, cor } = classificarInsight(`${ins.titulo} ${ins.conteudo}`);
                const confianca = ins.confianca ? Math.round(parseFloat(String(ins.confianca)) * 100) : null;
                return (
                  <motion.div
                    key={ins.id}
                    variants={reduzir ? undefined : fadeUp}
                    className="rounded-[0.9rem] border border-border p-4"
                    style={{ borderLeft: `3px solid ${cor}` }}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cor}18`, color: cor }}>
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{ins.titulo}</p>
                        <p className="text-xs text-foreground mt-1 leading-relaxed">{ins.conteudo}</p>
                        {confianca !== null && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] text-muted-foreground">{reportsConfig.insights.confidence}</span>
                            <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${confianca}%`, background: cor }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{confianca}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </motion.div>

      {/* Sugestões de campanha */}
      <motion.div variants={reduzir ? undefined : fadeUp}>
        <SectionCard title={reportsConfig.suggestions.title} description={reportsConfig.suggestions.description} icon={Sparkles}>
          {sugestoes.length === 0 ? (
            <EmptyState title={reportsConfig.suggestions.empty} illustration="generic" />
          ) : (
            <div className="space-y-2.5">
              {sugestoes.map((s) => {
                const badge = STATUS_SUGESTAO[s.status] ?? { label: s.status, color: "var(--muted-foreground)" };
                return (
                  <motion.div key={s.id} variants={reduzir ? undefined : fadeUp} className="rounded-[0.9rem] border border-border p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <span
                          className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-semibold mb-1.5"
                          style={{ background: badge.color + "20", color: badge.color }}
                        >
                          {badge.label}
                        </span>
                        <p className="text-sm font-semibold text-foreground">{s.titulo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.segmentoDescricao}</p>
                        <p className="text-xs text-foreground mt-1">{s.oferta}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {s.momentoSugerido && <>{reportsConfig.suggestions.timingLabel}: {s.momentoSugerido}</>}
                          {s.momentoSugerido && s.descontoMinimo && " · "}
                          {s.descontoMinimo && <>{reportsConfig.suggestions.discountLabel}: {Number(s.descontoMinimo).toFixed(0)}%</>}
                        </p>
                      </div>
                      {s.status === "sugerida" && (
                        <div className="flex gap-2 shrink-0">
                          <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => aprovar(s.id)}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[0.5rem] text-white font-medium"
                            style={{ background: "var(--gradient-signature)" }}
                          >
                            <ThumbsUp size={12} /> {reportsConfig.suggestions.approve}
                          </motion.button>
                          <button
                            onClick={() => rejeitar(s.id)}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[0.5rem] border border-border hover:bg-muted transition-colors"
                          >
                            <ThumbsDown size={12} /> {reportsConfig.suggestions.reject}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </motion.div>
    </motion.div>
  );
}
