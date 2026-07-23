"use client";

import { motion } from "framer-motion";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { getIcon } from "@/shared/config/icon-registry";
import type { PainelSaudeData } from "@/modules/canais/application/saude.service";
import saudeConfig from "@/config/saude.json";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 5, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: [0, 0, 0.2, 1] as [number, number, number, number] } },
};

function formatarData(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function SectionCard({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <motion.div variants={fadeUp} className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon size={14} strokeWidth={1.75} />
        </div>
        <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status === "concluido" || status === "sucesso" ? "ok"
    : status === "erro" || status === "falhou" ? "falhou"
      : status;
  const cfg = saudeConfig.status[normalized as keyof typeof saudeConfig.status] ?? saudeConfig.status.desconectado;
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: `${cfg.color}18`, color: cfg.color }}>
      <span className="inline-block size-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function ConectoresSection({ items }: { items: PainelSaudeData["conectores"] }) {
  const section = saudeConfig.sections.conectores;
  const Icon = getIcon(section.icon);
  return (
    <SectionCard title={section.title} icon={Icon}>
      {items.length === 0 ? (
        <EmptyState illustration="inbox" title={section.emptyTitle} description={section.emptyDescription} />
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium capitalize text-foreground">{item.tipo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Verificado: {formatarData(item.ultimaVerificacao)}</p>
                {item.ultimoErro && <p className="mt-1 text-xs text-destructive">{item.ultimoErro}</p>}
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function JobsSection({ items }: { items: PainelSaudeData["jobs"] }) {
  const section = saudeConfig.sections.jobs;
  const Icon = getIcon(section.icon);
  return (
    <SectionCard title={section.title} icon={Icon}>
      {items.length === 0 ? (
        <EmptyState illustration="generic" title={section.emptyTitle} description={section.emptyDescription} />
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{item.nome}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Tentativa {item.tentativa} · {formatarData(item.iniciadoEm)}</p>
                {item.erro && <p className="mt-1 line-clamp-2 text-xs text-destructive">{item.erro}</p>}
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function FalhasSection({ items }: { items: PainelSaudeData["falhas"] }) {
  const section = saudeConfig.sections.falhas;
  const Icon = getIcon(section.icon);
  return (
    <SectionCard title={section.title} icon={Icon}>
      {items.length === 0 ? (
        <EmptyState illustration="generic" title={section.emptyTitle} description={section.emptyDescription} />
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <article key={`${item.origem}-${item.id}`} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-destructive">{item.tipo}</p>
                <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>{formatarData(item.createdAt)}</time>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.mensagem}</p>
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function BackupSection() {
  const section = saudeConfig.sections.backup;
  const Icon = getIcon(section.icon);
  return (
    <SectionCard title={section.title} icon={Icon}>
      <div className="divide-y divide-border">
        {section.rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className="text-right text-sm font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function SaudePainel({ data }: { data: PainelSaudeData }) {
  return (
    <div>
      <PageHeader title={saudeConfig.header.title} description={saudeConfig.header.description} />
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <ConectoresSection items={data.conectores} />
          <FalhasSection items={data.falhas} />
        </div>
        <JobsSection items={data.jobs} />
        <BackupSection />
      </motion.div>
    </div>
  );
}
