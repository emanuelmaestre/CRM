"use client";

import { tint } from "@/shared/design-system/color";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { fadeUp, stagger } from "@/shared/design-system/motion-variants";
import { getIcon } from "@/shared/config/icon-registry";
import type { PainelSaudeData } from "@/modules/canais/application/saude.service";
import saudeConfig from "@/config/saude.json";
import { actionVerificarSaudeConectores } from "./actions";

function formatarData(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Nunca sincronizado";
}

function formatarValorOperacional(value: string) {
  const data = new Date(value);
  return Number.isNaN(data.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
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
    <span className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: tint(cfg.color, 9), color: cfg.color }}>
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
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {saudeConfig.labels.verifiedAt.replace("{date}", formatarData(item.ultimaVerificacao))}
                </p>
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
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {saudeConfig.labels.attempt
                    .replace("{attempt}", item.tentativa)
                    .replace("{date}", formatarData(item.iniciadoEm))}
                </p>
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

function ProntidaoSection({ items }: { items: PainelSaudeData["prontidao"] }) {
  const section = saudeConfig.sections.prontidao;
  const Icon = getIcon(section.icon);
  return (
    <SectionCard title={section.title} icon={Icon}>
      {items.length === 0 ? (
        <EmptyState illustration="generic" title={section.emptyTitle} description={section.emptyDescription} />
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <article key={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
              </div>
              <StatusBadge status={item.status} />
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function BackupSection({ items }: { items: PainelSaudeData["backup"] }) {
  const section = saudeConfig.sections.backup;
  const Icon = getIcon(section.icon);
  return (
    <SectionCard title={section.title} icon={Icon}>
      <div className="divide-y divide-border">
        {items.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className="text-right text-sm font-medium text-foreground">{formatarValorOperacional(row.value)}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function VerificarAgoraButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function verificar() {
    startTransition(async () => {
      try {
        await actionVerificarSaudeConectores();
        toast.success("Conectores verificados agora.");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível verificar os conectores.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={verificar}
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
      style={{ background: "var(--gradient-signature)" }}
    >
      <RotateCw size={14} className={pending ? "animate-spin" : undefined} />
      {pending ? "Verificando..." : "Verificar agora"}
    </button>
  );
}

export function SaudePainel({ data }: { data: PainelSaudeData }) {
  return (
    <div>
      <PageHeader
        title={saudeConfig.header.title}
        description={saudeConfig.header.description}
        actions={<VerificarAgoraButton />}
      />
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <ConectoresSection items={data.conectores} />
          <FalhasSection items={data.falhas} />
        </div>
        <JobsSection items={data.jobs} />
        <ProntidaoSection items={data.prontidao} />
        <BackupSection items={data.backup} />
      </motion.div>
    </div>
  );
}
