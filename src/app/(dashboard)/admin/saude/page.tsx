"use client";

import { motion } from "framer-motion";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { getIcon } from "@/shared/config/icon-registry";
import saudeConfig from "@/config/saude.json";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 5, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: [0, 0, 0.2, 1] as [number, number, number, number] } },
};

function SectionCard({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]"
    >
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
          <Icon size={14} strokeWidth={1.75} />
        </div>
        <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: keyof typeof saudeConfig.status }) {
  const cfg = saudeConfig.status[status] ?? saudeConfig.status.desconectado;
  return (
    <span
      className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: cfg.color + "18", color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function ConectoresSection() {
  const s = saudeConfig.sections.conectores;
  const Icon = getIcon(s.icon);
  return (
    <SectionCard title={s.title} icon={Icon}>
      <EmptyState
        illustration="inbox"
        title={s.emptyTitle}
        description={s.emptyDescription}
      />
    </SectionCard>
  );
}

function JobsSection() {
  const s = saudeConfig.sections.jobs;
  const Icon = getIcon(s.icon);
  return (
    <SectionCard title={s.title} icon={Icon}>
      <div className="space-y-0 divide-y divide-border">
        {saudeConfig.automacoes.map((a) => (
          <div key={a.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                <span className="text-muted-foreground mr-2 tabular-nums text-xs">{a.id}</span>
                {a.nome}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {a.cron ? `Cron: ${a.cron}` : `Evento: ${a.disparo}`}
              </p>
            </div>
            <StatusBadge status="ok" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function FalhasSection() {
  const s = saudeConfig.sections.falhas;
  const Icon = getIcon(s.icon);
  return (
    <SectionCard title={s.title} icon={Icon}>
      <EmptyState
        illustration="check"
        title={s.emptyTitle}
        description={s.emptyDescription}
      />
    </SectionCard>
  );
}

function BackupSection() {
  const s = saudeConfig.sections.backup;
  const Icon = getIcon(s.icon);
  return (
    <SectionCard title={s.title} icon={Icon}>
      <div className="space-y-0 divide-y divide-border">
        {s.rows.map((row) => (
          <div key={row.label} className="flex justify-between items-center py-2.5">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className="text-sm font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export default function SaudePage() {
  return (
    <div>
      <PageHeader
        title={saudeConfig.header.title}
        description={saudeConfig.header.description}
      />

      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
        <div className="grid md:grid-cols-2 gap-5">
          <ConectoresSection />
          <FalhasSection />
        </div>

        <JobsSection />

        <BackupSection />
      </motion.div>
    </div>
  );
}
