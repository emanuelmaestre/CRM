"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { eases } from "@/shared/design-system/motion-variants";
import {
  ArchiveRestore,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Database,
  FileJson2,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import settingsConfig from "@/config/settings.json";
import {
  actionConfirmarLoteHistorico,
  actionDescartarLoteHistorico,
  actionListarLotesHistoricos,
  actionObterLoteHistorico,
  actionPrepararLoteHistorico,
} from "./actions";

const config = settingsConfig.mercadoLivre.historicalImport;
const terminalStatuses = new Set(["concluido", "concluido_com_erros", "com_erros", "vazio", "erro"]);

type LoteResumo = Awaited<ReturnType<typeof actionListarLotesHistoricos>>[number];
type LoteDetalhe = Awaited<ReturnType<typeof actionObterLoteHistorico>>;

const protectionIcons = {
  stock: Boxes,
  automation: Workflow,
  sync: ShieldCheck,
  dates: CalendarDays,
} as const;

function dateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function intervaloInicial() {
  const ate = new Date();
  ate.setDate(ate.getDate() - 1);
  const de = new Date(ate);
  de.setFullYear(de.getFullYear() - 5);
  de.setMonth(0, 1);
  return { de: dateInput(de), ate: dateInput(ate) };
}

function paraIsoInicio(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function paraIsoFim(value: string) {
  const fim = new Date(`${value}T23:59:59.999`);
  return new Date(Math.min(fim.getTime(), Date.now())).toISOString();
}

function statusTone(status: string) {
  if (status === "concluido") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (["erro", "concluido_com_erros", "com_erros"].includes(status)) return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (status === "pronto") return "bg-violet-500/10 text-violet-700 dark:text-violet-300";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function stageLabel(fase: string) {
  return config.stages[fase as keyof typeof config.stages] ?? fase;
}

function HistoricalFlowIllustration() {
  const reduceMotion = useReducedMotion();
  return (
    <div
      role="img"
      aria-label={config.illustrationLabel}
      className="relative min-h-52 overflow-hidden rounded-[1.5rem] border border-white/70 bg-[radial-gradient(circle_at_15%_20%,rgba(250,204,21,.34),transparent_35%),radial-gradient(circle_at_85%_70%,rgba(124,58,237,.22),transparent_42%),linear-gradient(145deg,rgba(255,255,255,.92),rgba(245,243,255,.72))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.8)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_15%_20%,rgba(250,204,21,.16),transparent_36%),radial-gradient(circle_at_85%_70%,rgba(124,58,237,.18),transparent_44%),linear-gradient(145deg,rgba(24,24,27,.92),rgba(30,27,48,.82))]"
    >
      <div className="absolute inset-x-10 top-1/2 h-px border-t border-dashed border-violet-400/50" />

      <div className="relative flex min-h-40 items-center justify-between gap-4">
        <div className="relative h-32 w-36 shrink-0">
          {[0, 1, 2].map((item) => (
            <motion.div
              key={item}
              initial={reduceMotion ? false : { opacity: 0, x: -12, rotate: -4 }}
              animate={{ opacity: 1, x: item * 12, y: item * 10, rotate: item * 2 - 2 }}
              transition={{ delay: item * 0.12, duration: 0.45 }}
              className="absolute left-0 top-2 w-24 rounded-xl border border-black/5 bg-white p-3 shadow-lg shadow-amber-950/10 dark:border-white/10 dark:bg-zinc-900"
            >
              <div className="mb-2 flex items-center justify-between">
                <FileJson2 size={14} className="text-amber-500" />
                <span className="h-1.5 w-5 rounded-full bg-amber-300/70" />
              </div>
              <span className="block h-1.5 w-14 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <span className="mt-1.5 block h-1.5 w-9 rounded-full bg-zinc-100 dark:bg-zinc-800" />
            </motion.div>
          ))}
        </div>

        <div className="relative z-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.4rem] border border-violet-300/50 bg-white/90 shadow-xl shadow-violet-900/10 backdrop-blur dark:border-violet-400/20 dark:bg-zinc-900/90">
          <ShieldCheck size={34} className="text-violet-600 dark:text-violet-300" strokeWidth={1.7} />
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
            <Check size={13} strokeWidth={3} />
          </span>
        </div>

        <div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-[1.4rem] border border-white/80 bg-white/75 shadow-xl shadow-violet-950/10 backdrop-blur dark:border-white/10 dark:bg-zinc-900/70">
          <Database size={28} className="text-violet-600 dark:text-violet-300" strokeWidth={1.6} />
          <span className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">CRM</span>
          <div className="mt-2 flex gap-1">
            {[0, 1, 2].map((item) => <span key={item} className="h-1.5 w-1.5 rounded-full bg-emerald-400" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProtectionGrid() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {config.protections.map((item, index) => {
        const Icon = protectionIcons[item.id as keyof typeof protectionIcons] ?? ShieldCheck;
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * index }}
            className="flex items-start gap-3 rounded-xl border border-border/80 bg-background/65 p-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
              <Icon size={15} />
            </span>
            <span>
              <span className="block text-xs font-bold text-foreground">{item.label}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.description}</span>
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

function ProgressRail({ value, phase }: { value: number; phase: string }) {
  return (
    <div className="space-y-2" aria-label={`${stageLabel(phase)}: ${value}%`}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-2 font-semibold text-foreground">
          {value < 100 ? <Loader2 size={13} className="animate-spin text-violet-500" /> : <CheckCircle2 size={13} className="text-emerald-500" />}
          {stageLabel(phase)}
        </span>
        <span className="tabular-nums text-muted-foreground">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--karzi-accent),var(--acento-2),var(--success))]"
          initial={false}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.55, ease: eases.emphasized }}
        />
      </div>
    </div>
  );
}

function SummaryGrid({ lote }: { lote: LoteDetalhe }) {
  const stats = [
    { label: config.summary.found, value: lote.total ?? 0, icon: PackageCheck, tone: "text-foreground" },
    { label: config.summary.ready, value: lote.aceitos, icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-300" },
    { label: config.summary.quarantine, value: lote.rejeitados, icon: CircleAlert, tone: "text-amber-600 dark:text-amber-300" },
    { label: config.summary.duplicates, value: lote.duplicados, icon: ArchiveRestore, tone: "text-violet-600 dark:text-violet-300" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-border/80 bg-background/70 p-3">
          <stat.icon size={14} className={stat.tone} />
          <p className={`mt-2 text-xl font-black tabular-nums ${stat.tone}`}>{stat.value}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

function Celebration() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.5rem]">
      {[...Array(12)].map((_, index) => (
        <motion.span
          key={index}
          className="absolute left-1/2 top-8 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: ["var(--karzi-accent)", "var(--acento-2)", "var(--success)"][index % 3] }}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: (index - 5.5) * 23, y: 90 + (index % 4) * 15, opacity: 0, rotate: index * 55 }}
          transition={{ duration: 1.15, delay: index * 0.025, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

export function MLHistoricalImportSection() {
  const [inicial] = useState(() => intervaloInicial());
  const [expanded, setExpanded] = useState(false);
  const [brand, setBrand] = useState(settingsConfig.mercadoLivre.brands[0]?.slug ?? "karzi");
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [lotes, setLotes] = useState<LoteResumo[]>([]);
  const [active, setActive] = useState<LoteDetalhe | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const activeId = active?.id;
  const activeStatus = active?.status;

  const load = useCallback(async () => {
    try {
      const data = await actionListarLotesHistoricos();
      setLotes(data);
      const current = data.find((item) => ["preparando", "pronto", "importando"].includes(item.status));
      if (current) {
        const detail = await actionObterLoteHistorico(current.id);
        setActive(detail);
        setExpanded(true);
      }
    } catch {
      toast.error(config.errors.load);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    actionListarLotesHistoricos()
      .then(async (data) => {
        if (!mounted) return;
        setLotes(data);
        const current = data.find((item) => ["preparando", "pronto", "importando"].includes(item.status));
        if (current) {
          const detail = await actionObterLoteHistorico(current.id);
          if (!mounted) return;
          setActive(detail);
          setExpanded(true);
        }
      })
      .catch(() => { if (mounted) toast.error(config.errors.load); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!activeId || !activeStatus || terminalStatuses.has(activeStatus) || activeStatus === "pronto") return;
    const timer = window.setInterval(async () => {
      try {
        const detail = await actionObterLoteHistorico(activeId);
        setActive(detail);
        if (terminalStatuses.has(detail.status) || detail.status === "pronto") {
          const data = await actionListarLotesHistoricos();
          setLotes(data);
          if (detail.status === "concluido") toast.success(config.success);
        }
      } catch {
        window.clearInterval(timer);
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeId, activeStatus]);

  function preparar() {
    startTransition(async () => {
      try {
        const result = await actionPrepararLoteHistorico({
          brand,
          de: paraIsoInicio(de),
          ate: paraIsoFim(ate),
        });
        const detail = await actionObterLoteHistorico(result.loteId);
        setActive(detail);
        setConfirmed(false);
        setExpanded(true);
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : config.errors.prepare);
      }
    });
  }

  function importar() {
    if (!active || !confirmed) return;
    startTransition(async () => {
      try {
        await actionConfirmarLoteHistorico(active.id);
        setActive(await actionObterLoteHistorico(active.id));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : config.errors.confirm);
      }
    });
  }

  function descartar() {
    if (!active) return;
    startTransition(async () => {
      try {
        await actionDescartarLoteHistorico(active.id);
        setActive(null);
        setConfirmed(false);
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : config.errors.discard);
      }
    });
  }

  const bloqueadoPorLote = Boolean(active && ["preparando", "pronto", "importando"].includes(active.status));

  return (
    <section className="mt-6 border-t border-border pt-6">
      <div className="relative overflow-hidden rounded-[1.65rem] border border-violet-500/15 bg-[linear-gradient(135deg,rgba(250,204,21,.06),rgba(139,92,246,.07),rgba(34,197,94,.04))] p-4 sm:p-6">
        {active?.status === "concluido" && <Celebration />}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,.92fr)] xl:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/15 bg-violet-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              <Sparkles size={11} /> {config.eyebrow}
            </span>
            <h3 className="mt-3 text-xl font-black tracking-tight text-foreground sm:text-2xl">{config.title}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{config.description}</p>
            <div className="mt-5"><ProtectionGrid /></div>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background shadow-lg shadow-black/10 transition-transform hover:-translate-y-0.5"
            >
              <ArchiveRestore size={16} />
              {expanded ? "Recolher central histórica" : "Abrir central histórica"}
              <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
          <HistoricalFlowIllustration />
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-6 grid gap-4 border-t border-violet-500/10 pt-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,.92fr)]">
                <div className="space-y-4">
                  <div className="rounded-[1.25rem] border border-border bg-card/85 p-4 shadow-sm backdrop-blur sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-foreground">Preparar novo lote</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Primeiro analisamos o JSON remoto. Nada entra no CRM nesta etapa.</p>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-600 dark:text-amber-300">
                        <FileJson2 size={17} />
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className="space-y-1.5">
                        <span className="text-[11px] font-bold text-muted-foreground">{config.form.brand}</span>
                        <select value={brand} onChange={(event) => setBrand(event.target.value)} disabled={bloqueadoPorLote} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-50">
                          {settingsConfig.mercadoLivre.brands.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[11px] font-bold text-muted-foreground">{config.form.from}</span>
                        <input type="date" value={de} max={ate} onChange={(event) => setDe(event.target.value)} disabled={bloqueadoPorLote} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-50" />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[11px] font-bold text-muted-foreground">{config.form.until}</span>
                        <input type="date" value={ate} min={de} max={dateInput(new Date())} onChange={(event) => setAte(event.target.value)} disabled={bloqueadoPorLote} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-50" />
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={pending || bloqueadoPorLote || !de || !ate}
                      onClick={preparar}
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(100deg,var(--warning),var(--acento-2))] px-4 text-sm font-black text-white shadow-lg shadow-violet-900/15 transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {pending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                      {pending ? config.form.preparing : config.form.prepare}
                    </button>
                  </div>

                  <AnimatePresence mode="wait">
                    {active && (
                      <motion.div key={active.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="relative rounded-[1.25rem] border border-border bg-card/90 p-4 shadow-sm sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-black text-foreground">{active.brandName}</p>
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTone(active.status)}`}>{stageLabel(active.fase)}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">Lote {active.id.slice(0, 8).toUpperCase()} · JSON preservado</p>
                          </div>
                          {!(["importando", "concluido", "concluido_com_erros"].includes(active.status)) && (
                            <button type="button" disabled={pending} onClick={descartar} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50">
                              <Trash2 size={14} /> {config.review.discard}
                            </button>
                          )}
                        </div>
                        <div className="mt-4"><ProgressRail value={active.progresso} phase={active.fase} /></div>
                        <div className="mt-4"><SummaryGrid lote={active} /></div>

                        {active.pendencias.length > 0 && (
                          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                            <p className="flex items-center gap-2 text-xs font-black text-amber-700 dark:text-amber-300"><CircleAlert size={14} /> {config.quarantine.title}</p>
                            <div className="mt-2 space-y-1.5">
                              {active.pendencias.map((item) => {
                                const messages = Array.isArray(item.erros)
                                  ? item.erros.map((error) => typeof error === "object" && error && "mensagem" in error ? String(error.mensagem) : String(error))
                                  : ["Inconsistência no pedido."];
                                return <p key={item.providerRecordId} className="text-[11px] leading-5 text-muted-foreground"><span className="font-bold text-foreground">#{item.providerRecordId}</span> · {messages.join(" ")}</p>;
                              })}
                            </div>
                            <p className="mt-2 text-[11px] font-medium text-amber-700/80 dark:text-amber-300/80">{config.quarantine.hint}</p>
                          </div>
                        )}

                        {active.status === "pronto" && (
                          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                            <p className="text-sm font-black text-foreground">{config.review.title}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{config.review.description}</p>
                            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/75 p-3">
                              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600" />
                              <span className="text-xs font-semibold leading-5 text-foreground">{config.review.confirmation}</span>
                            </label>
                            <button type="button" disabled={pending || !confirmed || active.aceitos === 0} onClick={importar} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-lg shadow-emerald-950/15 transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-45">
                              {pending ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
                              {pending ? config.review.importing : `${config.review.confirm} (${active.aceitos})`}
                            </button>
                          </motion.div>
                        )}

                        {active.status === "concluido" && (
                          <div className="mt-4 flex items-start gap-3 rounded-xl bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
                            <p className="text-xs font-bold leading-5">{config.success}</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <aside className="rounded-[1.25rem] border border-border bg-card/70 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-foreground">{config.historyTitle}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Trilha operacional dos últimos processamentos</p>
                    </div>
                    <Clock3 size={17} className="text-muted-foreground" />
                  </div>
                  {loading ? (
                    <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Carregando lotes…</div>
                  ) : lotes.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-dashed border-border p-5 text-center">
                      <ArchiveRestore size={21} className="mx-auto text-muted-foreground" />
                      <p className="mt-2 text-xs text-muted-foreground">{config.empty}</p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {lotes.map((lote) => (
                        <button
                          key={lote.id}
                          type="button"
                          onClick={() => startTransition(async () => { setActive(await actionObterLoteHistorico(lote.id)); setConfirmed(false); })}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${active?.id === lote.id ? "border-violet-500/35 bg-violet-500/5" : "border-border hover:bg-muted/60"}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-xs font-black text-foreground">{lote.brandName}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone(lote.status)}`}>{stageLabel(lote.fase)}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(lote.createdAt))}</span>
                            <span className="tabular-nums">{lote.aceitos}/{lote.total ?? "—"}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </aside>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
