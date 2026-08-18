"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  Languages,
  LockKeyhole,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import appConfig from "@/config/app.json";
import { tint } from "@/shared/design-system/color";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogoGroup } from "@/shared/design-system/primitives/BrandLogoGroup";
import { springs, transicao, variantes } from "@/shared/design-system/motion-variants";
import type { BrandSlug } from "@/shared/config/brands";
import type { LegalDocument } from "./legal-documents";

const labels = {
  pt: {
    home: "Voltar ao login",
    language: "Ver em",
    steps: "Etapas do documento",
    commitments: "Compromissos principais",
    sources: "Fontes e políticas consideradas",
    contact: "Contato",
    previous: "Anterior",
    next: "Próxima",
    step: "Etapa",
    of: "de",
    operatedBy: "Operado por",
    legalNote:
      "Este documento é uma base operacional e de transparência para revisão de APIs. Ele não substitui revisão jurídica formal quando exigida.",
  },
  en: {
    home: "Back to login",
    language: "Read in",
    steps: "Document steps",
    commitments: "Main commitments",
    sources: "Sources and policies considered",
    contact: "Contact",
    previous: "Previous",
    next: "Next",
    step: "Step",
    of: "of",
    operatedBy: "Operated by",
    legalNote:
      "This document is an operational transparency baseline for API review. It does not replace formal legal review where required.",
  },
} as const;

const iconByKey = {
  badge: BadgeCheck,
  database: Database,
  file: FileCheck2,
  lock: LockKeyhole,
  shield: ShieldCheck,
  shop: null,
  store: null,
  user: UserCheck,
} as const;

/** As etapas de integração (TikTok Shop, Shopee) já têm identidade visual
 *  própria em /logos — usar o ícone real do canal em vez de um glifo
 *  genérico deixa claro, de cara, de qual API a etapa está falando. */
const channelByIcon: Partial<Record<keyof typeof iconByKey, string>> = {
  shop: "tiktokshop",
  store: "shopee",
};

function StepIcon({
  icon,
  size,
  className,
}: {
  icon: keyof typeof iconByKey;
  size: number;
  className?: string;
}) {
  const channel = channelByIcon[icon];
  if (channel) {
    return <ChannelLogo canal={channel} variant="logo" size={size >= 20 ? "md" : "sm"} className={className} />;
  }
  const Icon = iconByKey[icon];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
}

export function LegalWizardDocument({ document }: { document: LegalDocument }) {
  const copy = labels[document.locale];
  const reduzir = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = document.sections[activeIndex];
  const progress = useMemo(() => ((activeIndex + 1) / document.sections.length) * 100, [activeIndex, document.sections.length]);
  const direction = useMemo(() => (activeIndex === 0 ? 0 : 1), [activeIndex]);

  const slide = {
    hidden: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 14 : -14 }),
    show: { opacity: 1, x: 0, transition: springs.settleFast },
    exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -10 : 10, transition: { duration: 0.12 } }),
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* Faixa de assinatura visual — mesmo halo suave usado no login, sem imagem externa */}
      <div className="relative overflow-hidden border-b border-border bg-card/80">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-[-6rem] h-72 w-72 rounded-full opacity-[0.12] blur-3xl sm:h-96 sm:w-96"
          style={{ background: "var(--gradient-signature)" }}
        />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/auth/login"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={15} />
              {copy.home}
            </Link>
            <Link
              href={document.alternateHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <Languages size={15} />
              {copy.language} {document.alternateLabel}
            </Link>
          </div>

          <motion.section
            initial={variantes(reduzir, { opacity: 0, y: 8 })}
            animate={variantes(reduzir, { opacity: 1, y: 0 })}
            transition={transicao(reduzir, springs.settle)}
            className="grid gap-5 py-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end"
          >
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground">
                  <FileText size={13} />
                  Elisa Lima CRM
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-1.5 pl-1.5 pr-3 text-xs font-semibold text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ChannelLogo canal="tiktokshop" size="xs" variant="badge" />
                    <ChannelLogo canal="shopee" size="xs" variant="badge" />
                  </span>
                  TikTok Shop &amp; Shopee
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-normal text-foreground sm:text-4xl">{document.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{document.description}</p>
              <div className="mt-4 flex items-center gap-2.5 text-xs font-semibold text-muted-foreground">
                <span className="uppercase tracking-[0.08em]">{copy.operatedBy}</span>
                <BrandLogoGroup height={16} />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{document.lastUpdated}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "var(--gradient-signature)" }}
                  animate={{ width: `${progress}%` }}
                  transition={transicao(reduzir, springs.settleFast)}
                  initial={false}
                />
              </div>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {copy.step} {activeIndex + 1} {copy.of} {document.sections.length}
              </p>
            </div>
          </motion.section>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{copy.steps}</h2>
            <div className="space-y-2">
              {document.sections.map((section, index) => {
                const selected = index === activeIndex;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className="relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    style={{ borderColor: selected ? "var(--primary)" : "var(--border)" }}
                  >
                    {selected && (
                      <motion.span
                        layoutId="etapa-ativa"
                        className="absolute inset-0 rounded-lg bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]"
                        transition={transicao(reduzir, springs.settle)}
                      />
                    )}
                    <span
                      className="relative mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={!selected ? { background: tint("var(--muted-foreground)", 8), color: "var(--muted-foreground)" } : undefined}
                    >
                      <StepIcon icon={section.icon} size={16} className={selected ? "text-primary" : undefined} />
                    </span>
                    <span className="relative min-w-0">
                      <span className="block text-sm font-bold text-foreground">{section.title}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{section.eyebrow}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{copy.commitments}</h2>
            <div className="mt-3 space-y-2.5">
              {document.commitments.map((item) => (
                <p key={item} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  {item}
                </p>
              ))}
            </div>
          </section>
        </aside>

        <article className="min-w-0">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={active.id}
                custom={direction}
                variants={reduzir ? undefined : slide}
                initial={reduzir ? false : "hidden"}
                animate={reduzir ? undefined : "show"}
                exit={reduzir ? undefined : "exit"}
              >
                <div className="border-b border-border p-5 sm:p-6">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <StepIcon icon={active.icon} size={21} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{active.eyebrow}</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-normal text-foreground">{active.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{active.summary}</p>
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                  {active.body.map((paragraph) => (
                    <p key={paragraph} className="text-[15px] leading-relaxed text-foreground/85">{paragraph}</p>
                  ))}

                  {active.bullets && (
                    <div className="grid gap-2">
                      {active.bullets.map((bullet) => (
                        <div key={bullet} className="flex gap-2 rounded-lg bg-background p-3 text-sm leading-relaxed text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          <span>{bullet}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {active.table && (
                    <div className="overflow-hidden rounded-lg border border-border">
                      {active.table.map((row) => (
                        <div key={row.label} className="grid gap-2 border-b border-border bg-background p-4 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{row.label}</p>
                            <p className="mt-1 text-sm font-bold text-foreground">{row.value}</p>
                          </div>
                          <p className="text-sm leading-relaxed text-muted-foreground">{row.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-col-reverse gap-3 border-t border-border p-5 sm:flex-row sm:p-6">
              <button
                type="button"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ArrowLeft size={15} />
                {copy.previous}
              </button>
              <button
                type="button"
                disabled={activeIndex === document.sections.length - 1}
                onClick={() => setActiveIndex((index) => Math.min(document.sections.length - 1, index + 1))}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                style={{ background: "var(--gradient-signature)" }}
              >
                {copy.next}
                <ArrowRight size={15} />
              </button>
            </div>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-bold text-foreground">{copy.sources}</h2>
              <div className="mt-3 grid gap-2">
                {document.sources.map((source) => (
                  <a
                    key={source.href}
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="inline-flex items-center gap-2">
                      {source.label.toLowerCase().includes("tiktok") && <ChannelLogo canal="tiktokshop" size="xs" variant="logo" />}
                      {source.label.toLowerCase().includes("shopee") && <ChannelLogo canal="shopee" size="xs" variant="logo" />}
                      {source.label}
                    </span>
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{copy.legalNote}</p>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-bold text-foreground">{document.contact.title}</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{document.contact.emailLabel}</dt>
                  <dd className="mt-1 font-semibold text-foreground">{document.contact.email}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{document.contact.addressLabel}</dt>
                  <dd className="mt-1 text-muted-foreground">{document.contact.address}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{document.contact.companyLabel}</dt>
                  <dd className="mt-1 text-muted-foreground">{document.contact.company}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
                {appConfig.brandOrder.map((brand) => (
                  <span
                    key={brand}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-bold text-muted-foreground"
                  >
                    {(brand as BrandSlug).replace("_", " ").toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
