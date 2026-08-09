"use client";

import { useEffect, useRef } from "react";
import { useInView } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  ListFilter,
  MoreVertical,
  ReceiptText,
  Smile,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardHead } from "./card-primitives";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import type { DashboardData } from "@/modules/relatorios/application/dashboard.service";

/** Placeholder para métrica ainda sem origem de dado no banco. */
const VAZIO = "—";

/* ── Gráfico de receita ────────────────────────────────────────
   Canvas com linhas de grade e rótulos de eixo. Consome a série
   real de receita diária do periodo (`revenue.bars`). */
function RevenueChart({ bars, peakLabel }: { bars: number[]; peakLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ref       = useRef(null);
  const inView    = useInView(ref, { once: true });
  const progress  = useRef(0);
  const raf       = useRef<number>(0);
  const maxRevenueBar = Math.max(...bars, 1);
  const peakRevenueBarIndex = bars.indexOf(maxRevenueBar);

  useEffect(() => {
    if (!inView) return;
    const canvas = canvasRef.current!;
    const draw = () => {
      progress.current = Math.min(progress.current + 0.025, 1);
      const ease = 1 - Math.pow(1 - progress.current, 3);
      const ctx  = canvas.getContext("2d")!;
      const dpr  = window.devicePixelRatio || 1;
      const W    = canvas.offsetWidth;
      const H    = canvas.offsetHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const axisH   = 18;               // faixa reservada aos rótulos do eixo X
      const plotH   = H - axisH;
      const gap     = 6;
      const bw      = (W - gap * (bars.length - 1)) / bars.length;
      const maxH    = plotH - 34;       // espaço para o tooltip do pico

      const styles = getComputedStyle(canvas);

      // Linhas de grade horizontais
      ctx.strokeStyle = styles.getPropertyValue("--chart-grid").trim() || "rgba(0,0,0,0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = Math.round((plotH / 4) * i) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      bars.forEach((v, i) => {
        const h  = (v / maxRevenueBar) * maxH * ease;
        const x  = i * (bw + gap);
        const y  = plotH - h;
        const r  = Math.min(4, bw / 2);
        const isPeak = i === peakRevenueBarIndex;

        ctx.beginPath();
        ctx.roundRect(x, y, bw, h, [r, r, 2, 2]);
        if (isPeak) {
          const g = ctx.createLinearGradient(x, y, x, plotH);
          g.addColorStop(0, "#E3131B");
          g.addColorStop(1, "#9B30D9");
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = styles.getPropertyValue("--chart-bar").trim() || "rgba(0,0,0,0.07)";
        }
        ctx.fill();

        if (isPeak && ease > 0.85) {
          const label = peakLabel;
          ctx.font = "bold 11px system-ui";
          const tw = ctx.measureText(label).width;
          const tx = Math.min(Math.max(x + bw / 2 - tw / 2 - 10, 0), W - tw - 20);
          const ty = y - 30;
          ctx.fillStyle = "#15171C";
          ctx.beginPath();
          ctx.roundRect(tx, ty, tw + 20, 22, 6);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillText(label, tx + 10, ty + 15);

          ctx.beginPath();
          ctx.moveTo(x + bw / 2 - 4, ty + 22);
          ctx.lineTo(x + bw / 2,     ty + 28);
          ctx.lineTo(x + bw / 2 + 4, ty + 22);
          ctx.fillStyle = "#15171C";
          ctx.fill();
        }
      });

      // Rótulos do eixo X — primeiro, meio e último ponto da série
      ctx.font = "600 10px system-ui";
      ctx.fillStyle = styles.getPropertyValue("--chart-axis").trim() || "rgba(0,0,0,0.45)";
      const marks = [0, Math.floor((bars.length - 1) / 2), bars.length - 1];
      marks.forEach((index, position) => {
        const label = `D-${bars.length - 1 - index}`;
        const tw = ctx.measureText(label).width;
        const cx = index * (bw + gap) + bw / 2;
        const x = position === 0
          ? 0
          : position === marks.length - 1
            ? W - tw
            : cx - tw / 2;
        ctx.fillText(label, x, H - 4);
      });

      if (progress.current < 1) raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [bars, inView, maxRevenueBar, peakLabel, peakRevenueBarIndex]);

  return (
    <div ref={ref} className="h-full min-h-[220px] w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

/* ── Card de métrica (Faturamento Total / Ticket Médio) ──────── */
function MetricCard({ title, icon: Icon, accent, value, deltaLabel, blob = false }: {
  title: string;
  icon: React.ElementType;
  accent?: string;
  value: string;
  deltaLabel: string;
  blob?: boolean;
}) {
  return (
    <Card className="group p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-headline-md text-foreground">{title}</h3>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={accent
            ? { background: accent + "18", color: accent }
            : { background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          <Icon size={18} strokeWidth={1.9} />
        </div>
      </div>
      <p className="text-stat-lg mb-2 text-foreground">{value}</p>
      <div className="flex flex-wrap items-center gap-2">
        {/* Comparativo entre periodos ainda nao e calculado pelo dashboard.service */}
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          <TrendingUp size={13} strokeWidth={2} />
          {VAZIO}
        </span>
        <span className="text-xs text-muted-foreground">{deltaLabel}</span>
      </div>
      {blob && accent && (
        <div
          className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full opacity-[0.07] blur-2xl transition-opacity group-hover:opacity-[0.14]"
          style={{ background: accent }}
        />
      )}
    </Card>
  );
}

/* ── Linha de métrica do card de atendimento ─────────────────── */
function SacRow({ icon: Icon, tone, title, subtitle, value, valueTone }: {
  icon: React.ElementType;
  tone: string;
  title: string;
  subtitle: string;
  value: string;
  valueTone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: tone + "18", color: tone }}
        >
          <Icon size={15} strokeWidth={1.9} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <span
        className="shrink-0 text-lg font-bold tabular-nums"
        style={{ color: valueTone ?? "var(--foreground)" }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Botão de rodapé de card ─────────────────────────────────
   Desabilitado enquanto a ação nao tem rota/serviço correspondente. */
function CardFooterButton({ label, variant = "outline" }: {
  label: string;
  variant?: "outline" | "tonal";
}) {
  return (
    <button
      type="button"
      disabled
      title="Disponivel apos a integracao dos canais"
      className={`mt-auto w-full cursor-not-allowed rounded-lg py-2.5 text-sm font-semibold opacity-60 ${
        variant === "tonal"
          ? "bg-muted text-foreground"
          : "border border-border text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

/* ── Bloco "Visão Geral" — 7 cards do layout de referência ───── */
export function VisaoGeralCards({ revenue }: { revenue: DashboardData["revenue"] }) {
  return (
    <div className="flex flex-col gap-5">
      {/* SEÇÃO 1 — Faturamento (métricas + gráfico) */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-1">
          <MetricCard
            title="Faturamento Total"
            icon={Wallet}
            accent="#9B30D9"
            value={revenue.value}
            deltaLabel="vs periodo anterior"
            blob
          />
          {/* Ticket medio ainda nao e exposto pelo dashboard.service */}
          <MetricCard
            title="Ticket Medio"
            icon={ReceiptText}
            value={VAZIO}
            deltaLabel="vs periodo anterior"
          />
        </div>

        <Card className="flex flex-col lg:col-span-2" coachmark="dashboard-revenue">
          <CardHead
            title="Evolucao do Faturamento"
            subtitle="Analise de receita diaria no periodo selecionado"
            divided={false}
            trailing={
              <span className="flex items-center gap-2 text-label-md text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: "var(--gradient-signature)" }}
                />
                Receita diaria
              </span>
            }
          />
          <div className="flex-1 px-6 pb-6">
            <RevenueChart bars={revenue.bars} peakLabel={revenue.peakLabel} />
            <p className="mt-3 text-xs text-muted-foreground">{revenue.pendingText}</p>
          </div>
        </Card>
      </section>

      {/* SEÇÃO 2 — Ranking de produtos + saúde do atendimento */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="flex flex-col lg:col-span-8">
          <CardHead
            title="Produtos Mais Vendidos"
            action="Ver Relatorio Completo"
            actionHref="/relatorios"
          />
          <EmptyState
            illustration="reports"
            title="Ainda sem vendas no período"
            description="O ranking de produtos aparece aqui assim que as primeiras vendas forem registradas."
          />
        </Card>

        <Card className="flex flex-col lg:col-span-4">
          <CardHead title="Saude do Atendimento" divided={false} />
          <div className="flex flex-1 flex-col gap-3 px-6 pb-6">
            <SacRow
              icon={AlertTriangle}
              tone="#C21820"
              title="Tickets Abertos"
              subtitle="Aguardando resposta"
              value={VAZIO}
            />
            <SacRow
              icon={Clock}
              tone="#2563EB"
              title="Tempo Medio Resposta"
              subtitle="Ultimas 24 horas"
              value={VAZIO}
            />
            <SacRow
              icon={Smile}
              tone="#1F8A4C"
              title="NPS Atual"
              subtitle="Satisfacao do cliente"
              value={VAZIO}
            />
            <CardFooterButton label="Abrir Central de Ajuda" variant="tonal" />
          </div>
        </Card>
      </section>

      {/* SEÇÃO 3 — Estoque */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHead
            title="Alerta de Baixo Estoque"
            badge={{ label: "Critico", tone: "#C21820" }}
            divided={false}
            trailing={
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground">
                <MoreVertical size={16} strokeWidth={1.9} />
              </span>
            }
          />
          <div className="flex flex-1 flex-col px-6 pb-6">
            <EmptyState
              title="Nenhum item em baixo estoque"
              description="Assim que um produto atingir o mínimo cadastrado, ele aparece aqui."
            />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHead
            title="Itens Parados (>90 dias)"
            badge={{ label: "Atencao", tone: "#B57A00" }}
            divided={false}
            trailing={
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground">
                <ListFilter size={16} strokeWidth={1.9} />
              </span>
            }
          />
          <div className="flex flex-1 flex-col px-6 pb-6">
            <EmptyState
              title="Nenhum item parado"
              description="Produtos sem vendas há mais de 90 dias aparecem aqui."
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
