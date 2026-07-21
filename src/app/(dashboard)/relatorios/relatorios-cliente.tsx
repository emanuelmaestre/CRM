"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { toast } from "sonner";
import {
  actionRelatorioVendas,
  actionListarSugestoes,
  actionListarInsights,
  actionConsumIA,
  actionAprovarSugestao,
  actionRejeitarSugestao,
  actionGerarDocumentoExecutivo,
} from "./actions";
import reportsConfig from "@/config/reports.json";

type RelatorioVendas = Awaited<ReturnType<typeof actionRelatorioVendas>>;
type Sugestao = Awaited<ReturnType<typeof actionListarSugestoes>>[number];
type Insight = Awaited<ReturnType<typeof actionListarInsights>>[number];
type ConsumoIA = Awaited<ReturnType<typeof actionConsumIA>>;
type DocExecutivo = Awaited<ReturnType<typeof actionGerarDocumentoExecutivo>>;

const CANAL_LABEL: Record<string, string> = reportsConfig.channels;
const STATUS_SUGESTAO: Record<string, { label: string; color: string }> = reportsConfig.suggestionStatus;

function formatarBRL(valor: string | number | null | undefined): string {
  const n = parseFloat(String(valor ?? 0));
  return n.toLocaleString(reportsConfig.locale, { style: "currency", currency: reportsConfig.currency });
}

async function exportarXLSX(dados: RelatorioVendas, totalReceita: number) {
  const { utils, writeFile } = await import("xlsx");
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
  const ws = utils.aoa_to_sheet(linhas);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, reportsConfig.exports.sheetName);
  writeFile(wb, `${reportsConfig.exports.filePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
  doc.text(`${reportsConfig.exports.period}  |  ${reportsConfig.exports.generatedAt}: ${hoje}`, 14, 28);

  // KPIs
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
  const [, startTransition] = useTransition();

  const carregar = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      try {
        const [v, s, i, c] = await Promise.all([
          actionRelatorioVendas(),
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

  useEffect(() => { carregar(); }, [carregar]);

  async function aprovar(id: string) {
    try {
      await actionAprovarSugestao(id);
      toast.success(reportsConfig.messages.approveSuccess);
      carregar();
    } catch {
      toast.error(reportsConfig.messages.approveError);
    }
  }

  async function rejeitar(id: string) {
    try {
      await actionRejeitarSugestao(id, reportsConfig.suggestions.rejectionReason);
      toast.success(reportsConfig.messages.rejectSuccess);
      carregar();
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : reportsConfig.messages.documentError;
      toast.error(msg);
    } finally {
      setGerandoDoc(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{reportsConfig.messages.loading}</div>;
  }

  const totalReceita = vendas?.porCanal.reduce((s, r) => s + parseFloat(String(r.receita ?? 0)), 0) ?? 0;
  const totalPedidos = vendas?.porCanal.reduce((s, r) => s + Number(r.total), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: reportsConfig.kpis[0], valor: formatarBRL(totalReceita) },
          { label: reportsConfig.kpis[1], valor: String(totalPedidos) },
          { label: reportsConfig.kpis[2], valor: String(vendas?.porCanal.length ?? 0) },
          { label: reportsConfig.kpis[3], valor: consumoIA ? `${consumoIA.percentual}% — $${consumoIA.consumoAtualUsd.toFixed(3)}` : "—" },
        ].map((k) => (
          <div key={k.label} className="rounded-[1.25rem] border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-xl font-bold text-foreground mt-1">{k.valor}</p>
          </div>
        ))}
      </div>

      {/* Alerta consumo IA */}
      {consumoIA?.alerta && (
        <div className="rounded-[1rem] border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          ⚠️ Consumo de IA atingiu {consumoIA.alerta} do orçamento mensal (${consumoIA.orcamentoUsd}/mês).
        </div>
      )}

      {/* Vendas por canal */}
      <div className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-foreground">{reportsConfig.sales.title}</p>
            <p className="text-xs text-muted-foreground">{reportsConfig.sales.period}</p>
          </div>
          {vendas && vendas.porCanal.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => exportarCSV(vendas)}
                className="text-xs px-3 py-1.5 rounded-[0.5rem] border border-border hover:bg-muted transition-colors"
              >
                CSV
              </button>
              <button
                onClick={() => exportarXLSX(vendas, totalReceita)}
                className="text-xs px-3 py-1.5 rounded-[0.5rem] border border-border hover:bg-muted transition-colors"
              >
                XLSX
              </button>
              <button
                onClick={() => exportarPDF(vendas, totalReceita, totalPedidos)}
                className="text-xs px-3 py-1.5 rounded-[0.5rem] border border-border hover:bg-muted transition-colors"
              >
                PDF
              </button>
              <button
                onClick={gerarDocumento}
                disabled={gerandoDoc}
                className="text-xs px-3 py-1.5 rounded-[0.5rem] text-white font-medium disabled:opacity-50 transition-opacity"
                style={{ background: "var(--gradient-signature)" }}
              >
                {gerandoDoc ? reportsConfig.executiveDocument.generating : reportsConfig.executiveDocument.action}
              </button>
            </div>
          )}
        </div>
        {!vendas || vendas.porCanal.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {reportsConfig.sales.empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {reportsConfig.exports.columns.map((column, index) => (
                    <th key={column} className={`${index === 0 ? "text-left" : "text-right"} px-5 py-3 text-xs font-medium text-muted-foreground`}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendas.porCanal.map((r, i) => {
                  const receita = parseFloat(String(r.receita ?? 0));
                  const pct = totalReceita > 0 ? ((receita / totalReceita) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={r.canal} className={i < vendas.porCanal.length - 1 ? "border-b border-border" : ""}>
                      <td className="px-5 py-3 font-medium text-foreground">{CANAL_LABEL[r.canal] ?? r.canal}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{String(r.total)}</td>
                      <td className="px-5 py-3 text-right font-medium text-foreground">{formatarBRL(receita)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Documento Executivo IA */}
      {docExecutivo && (
        <div className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">{docExecutivo.titulo}</p>
            <p className="text-xs text-muted-foreground">{reportsConfig.executiveDocument.generatedCaption}</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <p className="text-sm text-foreground leading-relaxed">{docExecutivo.resumo}</p>
            {docExecutivo.destaques.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">{reportsConfig.executiveDocument.sections.highlights}</p>
                <ul className="space-y-1">
                  {docExecutivo.destaques.map((d, i) => (
                    <li key={i} className="text-xs text-foreground flex gap-2"><span className="text-emerald-500">✓</span>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {docExecutivo.alertas.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">{reportsConfig.executiveDocument.sections.alerts}</p>
                <ul className="space-y-1">
                  {docExecutivo.alertas.map((a, i) => (
                    <li key={i} className="text-xs text-foreground flex gap-2"><span className="text-amber-500">⚠</span>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {docExecutivo.recomendacoes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">{reportsConfig.executiveDocument.sections.recommendations}</p>
                <ul className="space-y-1">
                  {docExecutivo.recomendacoes.map((r, i) => (
                    <li key={i} className="text-xs text-foreground flex gap-2"><span className="text-purple-500">→</span>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              {reportsConfig.executiveDocument.disclaimer}
            </p>
          </div>
        </div>
      )}

      {/* Insights IA */}
      {insights.length > 0 && (
        <div className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">{reportsConfig.insights.title}</p>
            <p className="text-xs text-muted-foreground">{reportsConfig.insights.description}</p>
          </div>
          <div className="divide-y divide-border">
            {insights.map((ins) => (
              <div key={ins.id} className="px-5 py-4">
                <p className="text-sm font-semibold text-foreground">{ins.titulo}</p>
                <p className="text-xs text-foreground mt-1 leading-relaxed">{ins.conteudo}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {reportsConfig.insights.confidence}: {ins.confianca ? `${Math.round(parseFloat(String(ins.confianca)) * 100)}%` : "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sugestões de campanha */}
      <div className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">{reportsConfig.suggestions.title}</p>
          <p className="text-xs text-muted-foreground">{reportsConfig.suggestions.description}</p>
        </div>
        {sugestoes.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {reportsConfig.suggestions.empty}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sugestoes.map((s) => {
              const badge = STATUS_SUGESTAO[s.status] ?? { label: s.status, color: "var(--muted-foreground)" };
              return (
                <div key={s.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ background: badge.color + "20", color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{s.titulo}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.segmentoDescricao}</p>
                      <p className="text-xs text-foreground mt-1">{s.oferta}</p>
                    </div>
                    {s.status === "sugerida" && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => aprovar(s.id)}
                          className="text-xs px-3 py-1.5 rounded-[0.5rem] text-white font-medium"
                          style={{ background: "var(--gradient-signature)" }}
                        >
                          {reportsConfig.suggestions.approve}
                        </button>
                        <button
                          onClick={() => rejeitar(s.id)}
                          className="text-xs px-3 py-1.5 rounded-[0.5rem] border border-border hover:bg-muted transition-colors"
                        >
                          {reportsConfig.suggestions.reject}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
