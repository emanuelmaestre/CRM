"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ExternalLink, Languages } from "lucide-react";
import appConfig from "@/config/app.json";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { BrandLogoGroup } from "@/shared/design-system/primitives/BrandLogoGroup";
import { ElisaLimaLogo } from "@/shared/design-system/primitives/ElisaLimaLogo";
import { springs, transicao } from "@/shared/design-system/motion-variants";
import type { BrandSlug } from "@/shared/config/brands";
import type { LegalDocument } from "./legal-documents";

const labels = {
  pt: {
    home: "Voltar ao login",
    language: "Ler em",
    index: "Neste documento",
    commitments: "Em resumo",
    sources: "Fontes consultadas",
    contact: "Fale com a operadora",
    legalNote:
      "Base operacional e de transparência para revisão de APIs — não substitui revisão jurídica formal quando exigida.",
    scope: "Cobre integrações com",
    operatedBy: "Operado por",
    skip: "Ir para o conteúdo",
  },
  en: {
    home: "Back to login",
    language: "Read in",
    index: "In this document",
    commitments: "At a glance",
    sources: "Sources consulted",
    contact: "Talk to the operator",
    legalNote:
      "Operational transparency baseline for API review — does not replace formal legal review where required.",
    scope: "Covers integrations with",
    operatedBy: "Operated by",
    skip: "Skip to content",
  },
} as const;

/** Etapas de integração já têm identidade visual própria em /logos — usar o
 *  ícone real do canal em vez de um glifo genérico entrega, sem texto,
 *  qual API a seção descreve. */
const channelBySectionId: Record<string, string> = {
  "mercado-livre": "mercadolivre",
  "tiktok-shop": "tiktokshop",
  tiktok: "tiktokshop",
  shopee: "shopee",
};

function ordinal(index: number) {
  return String(index + 1).padStart(2, "0");
}

export function LegalWizardDocument({ document }: { document: LegalDocument }) {
  const copy = labels[document.locale];
  const reduzir = useReducedMotion();
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeId, setActiveId] = useState(document.sections[0]?.id);

  /* Página real de leitura, não um modal: rola com o documento (sem
     scroll-lock artificial), o que também preserva back/forward do
     navegador e a busca nativa (Ctrl+F) — um container com overflow
     próprio quebra as duas coisas sem necessidade aqui. */
  const { scrollYProgress } = useScroll();
  const barScale = useSpring(scrollYProgress, { stiffness: 300, damping: 40, restDelta: 0.001 });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [document]);

  function jumpTo(id: string) {
    const el = sectionRefs.current.find((node) => node?.id === id);
    el?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <a
        href="#conteudo"
        className="fixed left-3 top-3 z-50 -translate-y-16 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-transform focus:translate-y-0"
      >
        {copy.skip}
      </a>

      {/* Barra de progresso de leitura — fica acima de tudo, ligada ao scroll real da página */}
      <div className="sticky top-0 z-40 h-[2.5px] bg-border">
        <motion.div className="h-full origin-left" style={{ scaleX: barScale, background: "var(--gradient-signature)" }} />
      </div>

      {/* Navegação de seções no mobile/tablet — trilho vertical só existe em lg+, então a leitura
          em telas menores precisa de outra forma de "onde estou / para onde ir" */}
      <nav
        aria-label={copy.index}
        className="sticky top-[2.5px] z-30 flex gap-1.5 overflow-x-auto border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-sm lg:hidden"
      >
        {document.sections.map((section, index) => {
          const selected = section.id === activeId;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => jumpTo(section.id)}
              aria-current={selected ? "location" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {ordinal(index)} · {section.title}
            </button>
          );
        })}
      </nav>

      <div className="mx-auto flex w-full max-w-6xl">
        <div id="conteudo" className="min-w-0 flex-1 px-5 pb-24 pt-10 sm:px-8 sm:pt-14 lg:px-4">
          <div className="mx-auto max-w-[46rem]">
            {/* Cabeçalho: sem cartão, sem halo — respiro editorial */}
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
              <Link href="/auth/login" className={`inline-flex items-center gap-1.5 rounded-md transition-colors hover:text-foreground`}>
                <ArrowLeft size={13} />
                {copy.home}
              </Link>
              <Link
                href={document.alternateHref}
                className={`inline-flex items-center gap-1.5 rounded-md transition-colors hover:text-foreground`}
              >
                <Languages size={13} />
                {copy.language} {document.alternateLabel}
              </Link>
            </div>

            <motion.div
              initial={reduzir ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transicao(reduzir, springs.settle)}
              className="mt-9"
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Elisa Lima CRM · {document.lastUpdated}
              </p>
              <h1
                className="mt-3 text-[2.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[3.25rem]"
                style={{ fontFamily: "var(--font-sora)" }}
              >
                {document.title}
              </h1>
              <p className="mt-5 max-w-[38rem] text-base leading-relaxed text-muted-foreground">{document.description}</p>

              <div className="mt-7 grid gap-3 border-y border-border py-4 sm:grid-cols-2 sm:gap-6">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{copy.scope}</span>
                  <span className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center">
                      <ChannelLogo canal="mercadolivre" size="sm" variant="logo" />
                    </span>
                    <span className="flex h-5 w-5 items-center justify-center">
                      <ChannelLogo canal="tiktokshop" size="sm" variant="logo" />
                    </span>
                    <span className="flex h-5 w-5 items-center justify-center">
                      <ChannelLogo canal="shopee" size="sm" variant="logo" />
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-3 sm:border-l sm:border-border sm:pl-6">
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{copy.operatedBy}</span>
                  <span className="flex items-center gap-3">
                    <ElisaLimaLogo variant="header" className="!h-6 !w-auto shrink-0" />
                    <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
                    <BrandLogoGroup height={16} />
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Em resumo — lista corrida, não grid de cards */}
            <div className="mt-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{copy.commitments}</p>
              <ul className="mt-3 space-y-2.5">
                {document.commitments.map((item, i) => (
                  <motion.li
                    key={item}
                    initial={reduzir ? false : { opacity: 0, x: -6 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-10% 0px" }}
                    transition={transicao(reduzir, { ...springs.settleFast, delay: i * 0.04 })}
                    className="flex gap-2.5 text-sm leading-relaxed text-foreground/80"
                  >
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {item}
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Corpo — cada seção é um bloco editorial numerado, sem card dentro de card */}
            <div className="mt-14 space-y-16">
              {document.sections.map((section, index) => {
                const channel = channelBySectionId[section.id];
                return (
                  <motion.section
                    key={section.id}
                    id={section.id}
                    tabIndex={-1}
                    ref={(el) => {
                      sectionRefs.current[index] = el;
                    }}
                    initial={reduzir ? false : { opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
                    transition={transicao(reduzir, springs.settle)}
                    className="scroll-mt-24 outline-none"
                  >
                    <div className="flex items-baseline gap-4">
                      <span
                        aria-hidden="true"
                        className="select-none text-[2.75rem] font-bold leading-none tracking-[-0.03em] text-foreground/[0.08] sm:text-[3.5rem]"
                      >
                        {ordinal(index)}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          {channel && <ChannelLogo canal={channel} size="xs" variant="logo" />}
                          {section.eyebrow}
                        </p>
                        <h2
                          className="mt-1 text-2xl font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[1.75rem]"
                          style={{ fontFamily: "var(--font-sora)" }}
                        >
                          {section.title}
                        </h2>
                      </div>
                    </div>

                    <div className="mt-5 space-y-4 pl-0 sm:pl-[4.75rem]">
                      <p className="text-[15px] font-medium leading-relaxed text-foreground/70">{section.summary}</p>

                      {section.body.map((paragraph) => (
                        <p key={paragraph} className="text-[15px] leading-[1.75] text-foreground/85">
                          {paragraph}
                        </p>
                      ))}

                      {section.bullets && (
                        <ul className="space-y-2.5 border-l-2 border-border pl-4">
                          {section.bullets.map((bullet) => (
                            <li key={bullet} className="text-sm leading-relaxed text-muted-foreground">
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      )}

                      {section.table && (
                        <dl className="divide-y divide-border border-t border-border">
                          {section.table.map((row) => (
                            <div key={row.label} className="grid gap-1 py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-foreground">{row.value}</dt>
                              <dd className="text-sm leading-relaxed text-muted-foreground">{row.detail}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </motion.section>
                );
              })}
            </div>

            {/* Fontes + contato — encerramento em duas colunas soltas, sem cartão de dashboard */}
            <div className="mt-16 grid gap-10 border-t border-border pt-10 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{copy.sources}</p>
                <ul className="mt-3 space-y-2">
                  {document.sources.map((source) => (
                    <li key={source.href}>
                      <a
                        href={source.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`group inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground`}
                      >
                        {source.label.toLowerCase().includes("mercado") && <ChannelLogo canal="mercadolivre" size="xs" variant="logo" />}
                        {source.label.toLowerCase().includes("tiktok") && <ChannelLogo canal="tiktokshop" size="xs" variant="logo" />}
                        {source.label.toLowerCase().includes("shopee") && <ChannelLogo canal="shopee" size="xs" variant="logo" />}
                        <span className="border-b border-dotted border-muted-foreground/40 group-hover:border-foreground/60">
                          {source.label}
                        </span>
                        <ExternalLink aria-hidden="true" size={11} className="shrink-0 opacity-60" />
                        <span className="sr-only">({document.locale === "pt" ? "abre em nova aba" : "opens in new tab"})</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground/80">{copy.legalNote}</p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{document.contact.title}</p>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{document.contact.emailLabel}</dt>
                    <dd className="font-semibold text-foreground">
                      <a href={`mailto:${document.contact.email}`} className={`rounded-md transition-colors hover:text-muted-foreground`}>
                        {document.contact.email}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{document.contact.addressLabel}</dt>
                    <dd className="text-foreground/80">{document.contact.address}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{document.contact.companyLabel}</dt>
                    <dd className="mt-1.5 space-y-1.5 divide-y divide-border">
                      {document.contact.company.map((entity) => (
                        <p key={entity.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-1.5 first:pt-0">
                          <span className="font-semibold text-foreground">{entity.label}</span>
                          <span className="text-xs text-muted-foreground">{entity.document}</span>
                        </p>
                      ))}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <ElisaLimaLogo variant="header" className="!h-6 !w-auto shrink-0" />
                  <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
                  {appConfig.brandOrder.map((brand) => (
                    <BrandLogo key={brand} brand={brand as BrandSlug} height={15} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trilho lateral: marcador de leitura, não abas de wizard — só existe onde há espaço
            para não competir com o texto (telas menores usam a navegação horizontal acima) */}
        <nav
          aria-label={copy.index}
          className="sticky top-[2.5px] hidden h-fit w-16 shrink-0 flex-col items-center gap-1 self-start border-l border-border py-14 lg:flex xl:w-56 xl:items-stretch xl:px-6"
        >
          <p className="mb-2 hidden text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground xl:block">{copy.index}</p>
          <ol className="contents">
            {document.sections.map((section, index) => {
              const selected = section.id === activeId;
              return (
                <li key={section.id} className="contents">
                  <button
                    type="button"
                    onClick={() => jumpTo(section.id)}
                    aria-current={selected ? "location" : undefined}
                    title={section.title}
                    className="group relative flex w-full items-center gap-3 rounded-md py-2.5 text-left xl:pl-4"
                  >
                    <span
                      aria-hidden="true"
                      className="relative h-1.5 w-1.5 shrink-0 rounded-full transition-colors xl:hidden"
                      style={{ background: selected ? "var(--foreground)" : "var(--border)" }}
                    />
                    <span
                      className={`hidden text-xs font-semibold leading-snug transition-colors xl:block ${
                        selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground/70"
                      }`}
                    >
                      {ordinal(index)} · {section.title}
                    </span>
                    {selected && (
                      <motion.span
                        aria-hidden="true"
                        layoutId="trilho-ativo"
                        className="absolute left-0 top-1/2 hidden h-4/5 w-[3px] -translate-y-1/2 rounded-full xl:block"
                        style={{ background: "var(--foreground)" }}
                        transition={transicao(reduzir, springs.settle)}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          <Link
            href="/auth/login"
            className={`mt-auto hidden items-center gap-1.5 rounded-md pt-6 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground xl:inline-flex`}
          >
            {copy.home}
            <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </main>
  );
}
