"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  ShoppingBag, DollarSign, Users, AlertTriangle,
  TrendingUp, ArrowRight, Wifi, WifiOff, Zap,
} from "lucide-react";
import { BrandChip } from "@/shared/design-system/primitives/BrandChip";

/* ── Stagger container ─────────────────────────────────────────── */
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number,number,number,number] } },
};

const REVENUE_BARS = [38, 55, 42, 70, 52, 88, 65, 58, 80, 48, 72, 60, 90, 68];
const MAX_REVENUE_BAR = Math.max(...REVENUE_BARS);
const PEAK_REVENUE_BAR_INDEX = REVENUE_BARS.indexOf(MAX_REVENUE_BAR);

/* ── Card base ─────────────────────────────────────────────────── */
function Card({ children, className = "", glow, style }: {
  children: React.ReactNode; className?: string; glow?: string; style?: CSSProperties;
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(14,15,19,.12)" }}
      transition={{ duration: 0.18 }}
      className={`rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden relative ${className}`}
      style={style}
    >
      {glow && (
        <div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-[0.06] pointer-events-none"
          style={{ background: glow, filter: "blur(30px)" }}
        />
      )}
      {children}
    </motion.div>
  );
}

/* ── Animated chart ────────────────────────────────────────────── */
function RevenueChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ref       = useRef(null);
  const inView    = useInView(ref, { once: true });
  const progress  = useRef(0);
  const raf       = useRef<number>(0);

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
      const bw      = (W - gap * (REVENUE_BARS.length - 1)) / REVENUE_BARS.length;
      const maxH    = H - 28;

      REVENUE_BARS.forEach((v, i) => {
        const h  = (v / MAX_REVENUE_BAR) * maxH * ease;
        const x  = i * (bw + gap);
        const y  = H - h;
        const r  = Math.min(4, bw / 2);
        const isPeak = i === PEAK_REVENUE_BAR_INDEX;

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
          const label  = "R$ —";
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
  }, [inView]);

  return (
    <div ref={ref} className="w-full h-[110px]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

/* ── Hero: Revenue Tracker ─────────────────────────────────────── */
function RevenueTracker() {
  const days = ["D","S","T","Q","Q","S","S"];
  const [active, setActive] = useState(1);

  return (
    <Card glow="#9B30D9">
      <div className="p-6">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotate: 10, scale: 1.1 }}
              className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground"
            >
              <TrendingUp size={17} strokeWidth={1.75} />
            </motion.div>
            <h2 className="text-[22px] font-bold text-foreground leading-tight" style={{ fontFamily: "var(--font-sora)" }}>
              Receita Consolidada
            </h2>
          </div>
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5 text-xs font-medium text-foreground cursor-pointer select-none"
          >
            Mês <span className="opacity-40 ml-0.5">▾</span>
          </motion.div>
        </div>
        <p className="text-sm text-muted-foreground ml-12 mb-5">
          Acompanhe a evolução da receita e o detalhamento por canal e marca
        </p>

        <RevenueChart />

        {/* Day pills */}
        <div className="flex gap-1.5 mt-4 mb-5">
          {days.map((d, i) => (
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
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
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
            —
          </motion.span>
          <span className="text-sm text-muted-foreground pb-1 max-w-[200px] leading-tight">
            Integração pendente — conecte os canais para dados reais
          </span>
        </div>
      </div>
    </Card>
  );
}

/* ── Recent clients ────────────────────────────────────────────── */
function RecentClients() {
  const clients = [
    { name: "Ana Beatriz Silva", role: "WhatsApp · Shopee", brand: "karzi" as const },
    { name: "Lucas Mendes",      role: "Instagram · TikTok", brand: "wuwu"  as const },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
        <span className="text-sm font-bold text-foreground">Clientes recentes</span>
        <motion.a
          href="/clientes"
          whileHover={{ x: 2 }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Ver todos <ArrowRight size={11} />
        </motion.a>
      </div>
      <div className="p-5 space-y-3">
        {clients.map((c, i) => {
          const color = c.brand === "karzi" ? "#E3131B" : "#9B30D9";
          return (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 + 0.2 }}
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
              <BrandChip brand={c.brand} />
            </motion.div>
          );
        })}
      </div>
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground text-center">Dados simulados</p>
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
        className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 pointer-events-none animate-spin-slow"
        style={{ background: "var(--gradient-signature)", filter: "blur(20px)" }}
      />
      <div className="relative z-10">
        <div className="flex items-center gap-1.5 mb-3">
          <Zap size={13} strokeWidth={2.5} style={{ color: "var(--karzi-accent)" }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--karzi-accent)" }}>
            Ação necessária
          </span>
        </div>
        <p className="text-base font-bold leading-snug mb-1.5" style={{ color: "var(--background)" }}>
          Conecte seus canais
        </p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--background)", opacity: 0.6 }}>
          Ative WhatsApp, Shopee e TikTok para dados em tempo real
        </p>
      </div>
      <motion.a
        href="/configuracoes"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="relative z-10 mt-5 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium"
        style={{ background: "rgba(255,255,255,0.12)", color: "var(--background)" }}
      >
        Configurar agora
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
            whileHover={{ rotate: 12, scale: 1.15 }}
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
function RecentOrders() {
  const orders = [
    { id: "#0042", client: "Ana Beatriz",   brand: "karzi" as const, status: "Pago",      value: "R$ 189,90" },
    { id: "#0041", client: "Lucas Mendes",  brand: "wuwu"  as const, status: "Pendente",  value: "R$ 320,00" },
    { id: "#0040", client: "Carla Souza",   brand: "karzi" as const, status: "Pago",      value: "R$ 99,90"  },
    { id: "#0039", client: "Pedro Alves",   brand: "wuwu"  as const, status: "Cancelado", value: "R$ 450,00" },
    { id: "#0038", client: "Fernanda Lima", brand: "karzi" as const, status: "Pago",      value: "R$ 210,00" },
  ];

  const statusStyle: Record<string, string> = {
    "Pago":      "bg-[#1F8A4C]/10 text-[#1F8A4C]",
    "Pendente":  "bg-[#B57A00]/10 text-[#B57A00]",
    "Cancelado": "bg-[#C21820]/10 text-[#C21820]",
  };

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <span className="text-sm font-bold text-foreground">Pedidos recentes</span>
        <motion.a
          href="/vendas"
          whileHover={{ x: 2 }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Ver todos <ArrowRight size={11} />
        </motion.a>
      </div>
      <div>
        {orders.map((o, i) => {
          const color = o.brand === "karzi" ? "#E3131B" : "#9B30D9";
          return (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 + 0.1 }}
              whileHover={{ backgroundColor: "rgba(0,0,0,0.02)", x: 1 }}
              className="flex items-center gap-3 px-5 py-3.5 border-b border-border last:border-0 cursor-pointer"
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: color + "15", color }}
              >
                <ShoppingBag size={14} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{o.client}</p>
                <p className="text-xs text-muted-foreground">{o.id}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold tabular-nums text-foreground">{o.value}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyle[o.status]}`}>
                  {o.status}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground text-center">Dados simulados — integração pendente</p>
      </div>
    </Card>
  );
}

/* ── Channels ──────────────────────────────────────────────────── */
function Channels() {
  const channels = [
    { name: "WhatsApp (Z-API)", connected: false },
    { name: "Shopee",           connected: false },
    { name: "TikTok Shop",      connected: false },
    { name: "Instagram",        connected: false },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <span className="text-sm font-bold text-foreground">Canais</span>
        <motion.a
          href="/configuracoes"
          whileHover={{ x: 2 }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Configurar <ArrowRight size={11} />
        </motion.a>
      </div>
      <div className="p-4 space-y-2">
        {channels.map((c, i) => (
          <motion.div
            key={c.name}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 + 0.2 }}
            whileHover={{ x: 2 }}
            className="flex items-center gap-3 px-1 py-2 cursor-pointer"
          >
            <div className="relative">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                c.connected ? "bg-[#1F8A4C]/10 text-[#1F8A4C]" : "bg-muted text-muted-foreground"
              }`}>
                {c.connected ? <Wifi size={13} strokeWidth={2} /> : <WifiOff size={13} strokeWidth={1.75} />}
              </div>
              {c.connected && (
                <>
                  <span className="absolute inset-0 rounded-lg bg-[#1F8A4C]/20 animate-ping" />
                </>
              )}
            </div>
            <span className="text-sm text-foreground flex-1">{c.name}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              c.connected ? "bg-[#1F8A4C]/10 text-[#1F8A4C]" : "bg-muted text-muted-foreground"
            }`}>
              {c.connected ? "Ativo" : "Pendente"}
            </span>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function DashboardPage() {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-5">
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
          Painel
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Visão geral da operação — KARZI &amp; WUWU</p>
      </motion.div>

      {/* Layout 62 / 38 */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">

        {/* LEFT */}
        <div className="flex flex-col gap-5">
          <RevenueTracker />

          <div className="grid grid-cols-2 gap-5">
            <RecentClients />
            <ConnectCta />
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <KpiCard label="Pedidos hoje"   value="—" sub="Aguardando integração" icon={ShoppingBag}   accent="#E3131B" />
            <KpiCard label="Receita"        value="—" sub="Aguardando integração" icon={DollarSign}    accent="#9B30D9" />
            <KpiCard label="Clientes"       value="—" sub="Base importada"        icon={Users}         accent="#2563EB" />
            <KpiCard label="SKUs em alerta" value="—" sub="Estoque mínimo"        icon={AlertTriangle} accent="#B57A00" />
          </div>

          <RecentOrders />
          <Channels />
        </div>
      </div>
    </motion.div>
  );
}
