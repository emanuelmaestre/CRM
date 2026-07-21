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

type RelatorioVendas = Awaited<ReturnType<typeof actionRelatorioVendas>>;
type Sugestao = Awaited<ReturnType<typeof actionListarSugestoes>>[number];
type Insight = Awaited<ReturnType<typeof actionListarInsights>>[number];
type ConsumoIA = Awaited<ReturnType<typeof actionConsumIA>>;
type DocExecutivo = Awaited<ReturnType<typeof actionGerarDocumentoExecutivo>>;

const CANAL_LABEL: Record<string, string> = {
  shopee: "Shopee",
  mercadolivre: "Mercado Livre",
  tiktokshop: "TikTok Shop",
  whatsapp: "WhatsApp",
  manual: "Manual",
};

const STATUS_SUGESTAO: Record<string, { label: string; color: string }> = {
  sugerida: { label: "Aguardando", color: "#F59E0B" },
  aprovada: { label: "Aprovada", color: "#10B981" },
  rejeitada: { label: "Rejeitada", color: "#6B7280" },
  disparada: { label: "Disparada", color: "#9B30D9" },
};

function formatarBRL(valor: string | number | null | undefined): string {
  const n = parseFloat(String(valor ?? 0));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function exportarXLSX(dados: RelatorioVendas, totalReceita: number) {
  const { utils, writeFile } = await import("xlsx");
  const linhas = [
    ["Canal", "Pedidos", "Receita (R$)", "% do Total"],
    ...dados.porCanal.map((r) => {
      const receita = parseFloat(String(r.receita ?? 0));
      const pct = totalReceita > 0 ? ((receita / totalReceita) * 100).toFixed(1) : "0.0";
      return [CANAL_LABEL[r.canal] ?? r.canal, Number(r.total), receita, pct + "%"];
    }),
    [],
    ["Total", dados.porCanal.reduce((s, r) => s + Number(r.total), 0), totalReceita, "100%"],
  ];
  const ws = utils.aoa_to_sheet(linhas);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "Vendas por Canal");
  writeFile(wb, `vendas-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function exportarPDF(dados: RelatorioVendas, totalReceita: number, totalPedidos: number) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const hoje = new Date().toLocaleDateString("pt-BR");

  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.text("Relatório de Vendas — Plast Leo", 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Período: últimos 30 dias  |  Gerado em: ${hoje}`, 14, 28);

  // KPIs
  doc.setFontSize(12);
  doc.setTextColor(40);
  doc.text(`Receita Total: ${formatarBRL(totalReceita)}`, 14, 40);
  doc.text(`Total de Pedidos: ${totalPedidos}`, 14, 47);
  doc.text(`Canais Ativos: ${dados.porCanal.length}`, 14, 54);

  autoTable(doc, {
    startY: 62,
    head: [["Canal", "Pedidos", "Receita", "% do Total"]],
    body: dados.porCanal.map((r) => {
      const receita = parseFloat(String(r.receita ?? 0));
      const pct = totalReceita > 0 ? ((receita / totalReceita) * 100).toFixed(1) + "%" : "0%";
      return [CANAL_LABEL[r.canal] ?? r.canal, String(r.total), formatarBRL(receita), pct];
    }),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [155, 48, 217] },
  });

  doc.save(`vendas-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarCSV(dados: RelatorioVendas) {
  const linhas = [
    ["Canal", "Pedidos", "Receita"],
    ...dados.porCanal.map((r) => [CANAL_LABEL[r.canal] ?? r.canal, String(r.total), String(r.receita ?? 0)]),
  ];
  const csv = linhas.map((l) => l.join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendas-${new Date().toISOString().slice(0, 10)}.csv`;
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
        toast.error("Erro ao carregar relatórios.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function aprovar(id: string) {
    try {
      await actionAprovarSugestao(id);
      toast.success("Sugestão aprovada.");
      carregar();
    } catch {
      toast.error("Erro ao aprovar sugestão.");
    }
  }

  async function rejeitar(id: string) {
    try {
      await actionRejeitarSugestao(id, "Rejeitado pelo operador");
      toast.success("Sugestão rejeitada.");
      carregar();
    } catch {
      toast.error("Erro ao rejeitar sugestão.");
    }
  }

  async function gerarDocumento() {
    if (!process.env.NEXT_PUBLIC_OPENAI_DISPONIVEL && !vendas) return;
    setGerandoDoc(true);
    try {
      const doc = await actionGerarDocumentoExecutivo();
      setDocExecutivo(doc);
      toast.success("Documento executivo gerado!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao gerar documento.";
      toast.error(msg);
    } finally {
      setGerandoDoc(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Carregando relatórios…</div>;
  }

  const totalReceita = vendas?.porCanal.reduce((s, r) => s + parseFloat(String(r.receita ?? 0)), 0) ?? 0;
  const totalPedidos = vendas?.porCanal.reduce((s, r) => s + Number(r.total), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Receita (30 dias)", valor: formatarBRL(totalReceita) },
          { label: "Pedidos (30 dias)", valor: String(totalPedidos) },
          { label: "Canais ativos", valor: String(vendas?.porCanal.length ?? 0) },
          { label: "Consumo IA (mês)", valor: consumoIA ? `${consumoIA.percentual}% — $${consumoIA.consumoAtualUsd.toFixed(3)}` : "—" },
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
            <p className="text-sm font-semibold text-foreground">Vendas por canal</p>
            <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
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
                {gerandoDoc ? "Gerando…" : "Documento Executivo IA"}
              </button>
            </div>
          )}
        </div>
        {!vendas || vendas.porCanal.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum pedido registrado ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Canal</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Pedidos</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Receita</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">% do total</th>
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
            <p className="text-xs text-muted-foreground">Gerado agora pela IA — última atualização dos dados</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <p className="text-sm text-foreground leading-relaxed">{docExecutivo.resumo}</p>
            {docExecutivo.destaques.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Destaques</p>
                <ul className="space-y-1">
                  {docExecutivo.destaques.map((d, i) => (
                    <li key={i} className="text-xs text-foreground flex gap-2"><span className="text-emerald-500">✓</span>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {docExecutivo.alertas.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Alertas</p>
                <ul className="space-y-1">
                  {docExecutivo.alertas.map((a, i) => (
                    <li key={i} className="text-xs text-foreground flex gap-2"><span className="text-amber-500">⚠</span>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {docExecutivo.recomendacoes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Recomendações</p>
                <ul className="space-y-1">
                  {docExecutivo.recomendacoes.map((r, i) => (
                    <li key={i} className="text-xs text-foreground flex gap-2"><span className="text-purple-500">→</span>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              ⚠️ Resultado gerado por IA probabilística. Valide com a equipe antes de tomar decisões.
            </p>
          </div>
        </div>
      )}

      {/* Insights IA */}
      {insights.length > 0 && (
        <div className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Insights de funil</p>
            <p className="text-xs text-muted-foreground">Análises geradas automaticamente pela IA</p>
          </div>
          <div className="divide-y divide-border">
            {insights.map((ins) => (
              <div key={ins.id} className="px-5 py-4">
                <p className="text-sm font-semibold text-foreground">{ins.titulo}</p>
                <p className="text-xs text-foreground mt-1 leading-relaxed">{ins.conteudo}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Confiança: {ins.confianca ? `${Math.round(parseFloat(String(ins.confianca)) * 100)}%` : "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sugestões de campanha */}
      <div className="rounded-[1.25rem] border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Sugestões de campanha</p>
          <p className="text-xs text-muted-foreground">Geradas pela IA com base em scores de churn (fórmula RFM v2)</p>
        </div>
        {sugestoes.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma sugestão gerada ainda. A IA roda toda segunda-feira às 08:00.
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
                          Aprovar
                        </button>
                        <button
                          onClick={() => rejeitar(s.id)}
                          className="text-xs px-3 py-1.5 rounded-[0.5rem] border border-border hover:bg-muted transition-colors"
                        >
                          Rejeitar
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
