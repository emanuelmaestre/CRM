"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Filter } from "lucide-react";
import { SkeletonCard } from "@/shared/design-system/primitives/Skeleton";
import { CoachMarks, type CoachMarkStep } from "@/shared/design-system/primitives/CoachMarks";
import { stagger } from "@/shared/design-system/motion-variants";
import dashboardConfig from "@/config/dashboard.json";
import { VisaoGeralCards } from "./visao-geral-cards";
import { actionObterDashboardData } from "./actions";
import type {
  DashboardData,
  DashboardFilters,
} from "@/modules/relatorios/application/dashboard.service";

const DASHBOARD_TOUR_STEPS: CoachMarkStep[] = [
  {
    target: '[data-coachmark="dashboard-filters"]',
    title: "Filtre por período, marca e canal",
    description: "Todo o painel respeita esses filtros em tempo real.",
  },
  {
    target: '[data-coachmark="dashboard-revenue"]',
    title: "Receita e curva de vendas",
    description: "Dados reais do banco, não simulados.",
  },
];

const EMPTY_DASHBOARD: DashboardData = {
  filters: {
    period: "30d",
    brand: "todas",
    channel: "todos",
    brands: [{ value: "todas", label: "Todas as marcas" }],
    channels: [{ value: "todos", label: "Todos os canais" }],
  },
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
  channelPerformance: [],
  sellerPerformance: [],
  ruleBlocks: [],
  aiUsage: {
    cost: "US$ 0.00",
    runs: 0,
    successRate: "0%",
    detail: "Sem consumo de IA no periodo",
  },
};

/* ── Header da página + filtros ────────────────────────────────── */
function DashboardHeader({
  filters,
  value,
  onChange,
  loading,
}: {
  filters: DashboardData["filters"];
  value: Required<DashboardFilters>;
  onChange: (next: Required<DashboardFilters>) => void;
  loading: boolean;
}) {
  const selectClass = "h-10 appearance-none rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-[var(--shadow-card)] outline-none transition-colors hover:border-muted-foreground/40 focus:border-foreground disabled:opacity-60";

  return (
    <div
      className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      data-coachmark="dashboard-filters"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Filter size={17} strokeWidth={1.9} />
        </div>
        <div>
          <h1 className="text-headline-lg text-foreground">{dashboardConfig.header.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{dashboardConfig.header.description}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select className={selectClass} value={value.period} disabled={loading} onChange={(event) => onChange({ ...value, period: event.target.value as Required<DashboardFilters>["period"] })}>
          <option value="7d">Ultimos 7 dias</option>
          <option value="30d">Ultimos 30 dias</option>
          <option value="90d">Ultimos 90 dias</option>
        </select>
        <select className={selectClass} value={value.brand} disabled={loading} onChange={(event) => onChange({ ...value, brand: event.target.value })}>
          {filters.brands.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select className={selectClass} value={value.channel} disabled={loading} onChange={(event) => onChange({ ...value, channel: event.target.value })}>
          {filters.channels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [filters, setFilters] = useState<Required<DashboardFilters>>({
    period: "30d",
    brand: "todas",
    channel: "todos",
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    actionObterDashboardData(filters)
      .then((result) => {
        setData(result);
        setLoadError(null);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : "Nao foi possivel carregar o painel.");
      })
      .finally(() => setLoading(false));
  }, [filters]);

  const handleFilterChange = (next: Required<DashboardFilters>) => {
    setLoading(true);
    setFilters(next);
  };

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {!loading && <CoachMarks storageKey="crm-leo:coachmarks:dashboard:v1" steps={DASHBOARD_TOUR_STEPS} />}
      {loadError && (
        <div className="mb-4 rounded-lg border border-[#C21820]/20 bg-[#C21820]/10 px-4 py-3 text-sm text-[#C21820]">
          {loadError}
        </div>
      )}
      <DashboardHeader
        filters={data.filters}
        value={filters}
        onChange={handleFilterChange}
        loading={loading}
      />
      {loading && data === EMPTY_DASHBOARD ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="flex flex-col gap-5">
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <div className="lg:col-span-2"><SkeletonCard /></div>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-8"><SkeletonCard /></div>
            <div className="lg:col-span-4"><SkeletonCard /></div>
          </div>
        </div>
      ) : (
        /* Visão geral — faturamento, ranking de produtos, atendimento e estoque */
        <VisaoGeralCards revenue={data.revenue} />
      )}
    </motion.div>
  );
}
