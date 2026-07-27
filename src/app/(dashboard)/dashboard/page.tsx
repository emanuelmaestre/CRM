"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { BrandChip } from "@/shared/design-system/primitives/BrandChip";
import brandsConfig from "@/config/brands.json";
import dashboardConfig from "@/config/dashboard.json";
import { getIcon } from "@/shared/config/icon-registry";
import { actionObterDashboardData } from "./actions";
import type { DashboardData } from "@/modules/relatorios/application/dashboard.service";

/* ── Stagger container ─────────────────────────────────────────── */
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 6, scale: 0.97 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: [0, 0, 0.2, 1] as [number,number,number,number] } },
};

const RevenueIcon = getIcon(dashboardConfig.revenue.icon);
const CtaIcon = getIcon(dashboardConfig.connectCta.icon);
const OrderIcon = getIcon(dashboardConfig.recentOrders.icon);
const ChannelConnectedIcon = getIcon(dashboardConfig.channels.connectedIcon);
const ChannelDisconnectedIcon = getIcon(dashboardConfig.channels.disconnectedIcon);

const EMPTY_DASHBOARD: DashboardData = {
  revenue: {
    value: dashboardConfig.revenue.value,
    peakLabel: dashboardConfig.revenue.peakLabel,
    pendingText: dashboardConfig.revenue.pendingText,
    bars: dashboardConfig.revenue.bars,
  },
  kpis: dashboardConfig.kpis,
  recentClients: [],
  recentOrders: [],
  channels: dashboardConfig.channels.items.map((item) => ({
    name: item.name,
    connected: item.connected,
    status: item.connected ? "conectado" : "desconectado",
    detail: item.connected ? dashboardConfig.channels.connectedLabel : dashboardConfig.channels.disconnectedLabel,
  })),
};

/* ── Card base ─────────────────────────────────────────────────── */
function Card({ children, className = "", glow, style }: {
  children: React.ReactNode; className?: string; glow?: string; style?: CSSProperties;
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -1, boxShadow: "0 6px 24px rgba(14,15,19,.09)" }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      className={`rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden relative ${glow ? "border-t-2" : ""} ${className}`}
      style={style}
    >
      {glow && (
        <div
          className="absolute inset-x-0 top-0 h-0.5 pointer-events-none"
          style={{ background: glow }}
        />
      )}
      {children}
    </motion.div>
  );
}

/* ── Animated chart ────────────────────────────────────────────── */
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

      const gap     = 6;
      const bw      = (W - gap * (bars.length - 1)) / bars.length;
      const maxH    = H - 28;

      bars.forEach((v, i) => {
        const h  = (v / maxRevenueBar) * maxH * ease;
        const x  = i * (bw + gap);
        const y  = H - h;
        const r  = Math.min(4, bw / 2);
        const isPeak = i === peakRevenueBarIndex;

        ctx.beginPath();
        ctx.roundRect(x, y, bw, h, [r, r, 2, 2]);
        if (isPeak) {
          const g = ctx.createLinearGradient(x, y, x, H);
          g.addColorStop(0, "#E3131B");
          g.addColorStop(1, "#9B30D9");
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = "rgba(0,0,0,0.07)";
        }
        ctx.fill();

        // Tooltip on peak
        if (isPeak && ease > 0.85) {
          const label  = peakLabel;
          const tw     = ctx.measureText(label).width;
          const tx     = x + bw / 2 - tw / 2 - 10;
          const ty     = y - 30;
          ctx.fillStyle = "#15171C";
          ctx.beginPath();
          ctx.roundRect(tx, ty, tw + 20, 22, 6);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 11px system-ui";
          ctx.fillText(label, tx + 10, ty + 15);

          // arrow
          ctx.beginPath();
          ctx.moveTo(x + bw / 2 - 4, ty + 22);
          ctx.lineTo(x + bw / 2,     ty + 28);
          ctx.lineTo(x + bw / 2 + 4, ty + 22);
          ctx.fillStyle = "#15171C";
          ctx.fill();
        }
      });

      if (progress.current < 1) raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [bars, inView, maxRevenueBar, peakLabel, peakRevenueBarIndex]);

  return (
    <div ref={ref} className="w-full h-[110px]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

/* ── Hero: Revenue Tracker ─────────────────────────────────────── */
function RevenueTracker({ data }: { data: DashboardData["revenue"] }) {
  const [active, setActive] = useState(1);

  return (
    <Card glow="#9B30D9">
      <div className="p-6">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotate: 5, scale: 1.06 }}
              className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground"
            >
              <RevenueIcon size={17} strokeWidth={1.75} />
            </motion.div>
            <h2 className="text-[22px] font-bold text-foreground leading-tight" style={{ fontFamily: "var(--font-sora)" }}>
              {dashboardConfig.revenue.title}
            </h2>
          </div>
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5 text-xs font-medium text-foreground cursor-pointer select-none"
          >
            {dashboardConfig.revenue.period} <span className="opacity-40 ml-0.5">▾</span>
          </motion.div>
        </div>
        <p className="text-sm text-muted-foreground ml-12 mb-5">
          {dashboardConfig.revenue.description}
        </p>

        <RevenueChart bars={data.bars} peakLabel={data.peakLabel} />

        {/* Day pills */}
        <div className="flex gap-1.5 mt-4 mb-5">
          {dashboardConfig.revenue.days.map((d, i) => (
            <motion.button
              key={i}
              onClick={() => setActive(i)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              className="flex-1 h-8 rounded-full text-xs font-medium relative overflow-hidden"
            >
              <AnimatePresence>
                {active === i && (
                  <motion.span
                    layoutId="day-active"
                    className="absolute inset-0 bg-foreground rounded-full"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
              </AnimatePresence>
              <span className={`relative z-10 ${active === i ? "text-background" : "text-muted-foreground"}`}>
                {d}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Stat */}
        <div className="flex items-end gap-3">
          <motion.span
            key={active}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[36px] font-bold text-foreground leading-none tabular-nums"
          >
            {data.value}
          </motion.span>
          <span className="text-sm text-muted-foreground pb-1 max-w-[200px] leading-tight">
            {data.pendingText}
          </span>
        </div>
      </div>
    </Card>
  );
}

/* ── Recent clients ────────────────────────────────────────────── */
function RecentClients({ items }: { items: DashboardData["recentClients"] }) {
  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
        <span className="text-sm font-bold text-foreground">{dashboardConfig.recentClients.title}</span>
        <motion.a
          href={dashboardConfig.recentClients.href}
          whileHover={{ x: 2 }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {dashboardConfig.recentClients.action} <ArrowRight size={11} />
        </motion.a>
      </div>
      <div className="p-5 space-y-3">
        {items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum cliente cadastrado ainda.
          </p>
        )}
        {items.map((c, i) => {
          const color = c.brand ? brandsConfig[c.brand].color : "var(--muted-foreground)";
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 + 0.08, duration: 0.22, ease: [0, 0, 0.2, 1] }}
              whileHover={{ x: 2 }}
              className="flex items-center gap-3 cursor-pointer"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: color + "18", color }}
              >
                {c.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.role}</p>
              </div>
              {c.brand && <BrandChip brand={c.brand} />}
            </motion.div>
          );
        })}
      </div>
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground text-center">
          {items.length > 0 ? "Dados reais da base de clientes" : "Aguardando importacao ou cadastro"}
        </p>
      </div>
    </Card>
  );
}

/* ── Connect CTA ───────────────────────────────────────────────── */
function ConnectCta() {
  return (
    <Card className="p-5 flex flex-col justify-between" style={{ background: "var(--foreground)" }}>
      {/* Ambient glow */}
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 pointer-events-none"
        style={{ background: "var(--gradient-signature)", filter: "blur(20px)" }}
      />
      <div className="relative z-10">
        <div className="flex items-center gap-1.5 mb-3">
          <CtaIcon size={13} strokeWidth={2.5} style={{ color: "var(--karzi-accent)" }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--karzi-accent)" }}>
            {dashboardConfig.connectCta.eyebrow}
          </span>
        </div>
        <p className="text-base font-bold leading-snug mb-1.5" style={{ color: "var(--background)" }}>
          {dashboardConfig.connectCta.title}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--background)", opacity: 0.6 }}>
          {dashboardConfig.connectCta.description}
        </p>
      </div>
      <motion.a
        href={dashboardConfig.connectCta.href}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="relative z-10 mt-5 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium"
        style={{ background: "rgba(255,255,255,0.12)", color: "var(--background)" }}
      >
        {dashboardConfig.connectCta.action}
        <motion.span whileHover={{ x: 3 }} transition={{ type: "spring", stiffness: 400 }}>
          <ArrowRight size={15} strokeWidth={2} />
        </motion.span>
      </motion.a>
    </Card>
  );
}

/* ── KPI card ──────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub: string;
  icon: React.ElementType; accent: string;
}) {
  return (
    <Card glow={accent}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <motion.div
            whileHover={{ rotate: 6, scale: 1.08 }}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: accent + "18", color: accent }}
          >
            <Icon size={14} strokeWidth={1.75} />
          </motion.div>
        </div>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-2xl font-bold tabular-nums text-foreground leading-none"
        >
          {value}
        </motion.p>
        <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>
      </div>
    </Card>
  );
}

/* ── Recent orders ─────────────────────────────────────────────── */
function RecentOrders({ items }: { items: DashboardData["recentOrders"] }) {

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <span className="text-sm font-bold text-foreground">{dashboardConfig.recentOrders.title}</span>
        <motion.a
          href={dashboardConfig.recentOrders.href}
          whileHover={{ x: 2 }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {dashboardConfig.recentOrders.action} <ArrowRight size={11} />
        </motion.a>
      </div>
      <div>
        {items.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhum pedido recebido ainda.
          </p>
        )}
        {items.map((o, i) => {
          const color = brandsConfig[o.brand].color;
          return (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 + 0.1 }}
              whileHover={{ backgroundColor: "rgba(0,0,0,0.02)", x: 1 }}
              className="flex items-center gap-3 px-5 py-3.5 border-b border-border last:border-0 cursor-pointer"
              onClick={() => { window.location.href = o.href; }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: color + "15", color }}
              >
                <OrderIcon size={14} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{o.client}</p>
                <p className="text-xs text-muted-foreground">{o.id}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold tabular-nums text-foreground">{o.value}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${dashboardConfig.recentOrders.statusStyles[o.status as keyof typeof dashboardConfig.recentOrders.statusStyles] ?? "bg-muted text-muted-foreground"}`}>
                  {o.status}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground text-center">
          {items.length > 0 ? "Dados reais de pedidos normalizados" : "Aguardando integracao dos canais"}
        </p>
      </div>
    </Card>
  );
}

/* ── Channels ──────────────────────────────────────────────────── */
/* ── Page ──────────────────────────────────────────────────────── */
function Channels({ items }: { items: DashboardData["channels"] }) {
  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <span className="text-sm font-bold text-foreground">{dashboardConfig.channels.title}</span>
        <motion.a
          href={dashboardConfig.channels.href}
          whileHover={{ x: 2 }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {dashboardConfig.channels.action} <ArrowRight size={11} />
        </motion.a>
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => {
          const Icon = item.connected ? ChannelConnectedIcon : ChannelDisconnectedIcon;
          return (
            <div key={`${item.name}-${item.detail}`} className="flex items-center gap-3 px-5 py-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                item.connected ? "bg-[#1F8A4C]/10 text-[#1F8A4C]" : "bg-muted text-muted-foreground"
              }`}>
                <Icon size={14} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                item.connected ? "bg-[#1F8A4C]/10 text-[#1F8A4C]" : "bg-muted text-muted-foreground"
              }`}>
                {item.connected ? dashboardConfig.channels.connectedLabel : dashboardConfig.channels.disconnectedLabel}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    actionObterDashboardData()
      .then((result) => {
        setData(result);
        setLoadError(null);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : "Nao foi possivel carregar o painel.");
      })
      .finally(() => setLoading(false));
  }, []);

  const kpis = data.kpis.map((kpi) => ({ ...kpi, icon: getIcon(kpi.icon) }));

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Layout 62 / 38 — título vive dentro do hero card, igual ao TWISTY */}
      {loadError && (
        <div className="mb-4 rounded-xl border border-[#C21820]/20 bg-[#C21820]/10 px-4 py-3 text-sm text-[#C21820]">
          {loadError}
        </div>
      )}
      {loading && (
        <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Carregando dados reais do painel...
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-[62%_1fr] gap-5">

        {/* LEFT */}
        <div className="flex flex-col gap-5">
          <RevenueTracker data={data.revenue} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <RecentClients items={data.recentClients} />
            <ConnectCta />
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))}
          </div>

          <RecentOrders items={data.recentOrders} />
          <Channels items={data.channels} />
        </div>
      </div>
    </motion.div>
  );
}
