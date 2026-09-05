"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { TintedStatCard } from "@/shared/design-system/primitives/TintedStatCard";

export interface ExplicacaoCardVendas {
  titulo: string;
  descricao: string;
  calculo: string;
  inclui: string[];
  naoInclui: string[];
}

export function CardResumoVendas({
  label,
  valor,
  icon,
  cor,
  sub,
  explicacao,
}: {
  label: ReactNode;
  valor: ReactNode;
  icon: LucideIcon;
  cor: string;
  sub?: ReactNode;
  explicacao: ExplicacaoCardVendas;
}) {
  return (
    <div className="relative h-full">
      <TintedStatCard
        label={label}
        valor={valor}
        icon={icon}
        cor={cor}
        sub={sub}
        labelClassName="min-h-7 pr-7 sm:min-h-8 sm:pr-9"
        compactoNoMobile
        denso
      />
      <div className="absolute right-2 top-2 z-10">
        <AnimatedInfoPopover
          trigger={(
            <AnimatedInfoTrigger
              aria-label={`Entenda ${explicacao.titulo}`}
              title={`Entenda ${explicacao.titulo}`}
              iconSize={13}
              className="press-feedback inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
            />
          )}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[100] w-[min(24rem,calc(100vw-1.5rem))] rounded-[1.1rem] border border-border bg-card p-5 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
        >
          <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">
            {explicacao.titulo}
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-foreground">{explicacao.descricao}</p>

          <div className="mt-3 rounded-[0.75rem] bg-muted px-3 py-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[.06em] text-muted-foreground">Cálculo</p>
            <p className="mt-1 text-[12px] font-semibold leading-relaxed text-foreground">{explicacao.calculo}</p>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[.06em] text-success">O que entra</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed text-muted-foreground">
                {explicacao.inclui.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[.06em] text-destructive">O que não entra</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed text-muted-foreground">
                {explicacao.naoInclui.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </AnimatedInfoPopover>
      </div>
    </div>
  );
}
