"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { listItem, stagger } from "@/shared/design-system/motion-variants";
import { getIcon } from "@/shared/config/icon-registry";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead } from "./card-primitives";
import type { ReclamacoesResultado } from "@/modules/relatorios/application/reclamacoes.service";

const copy = dashboardConfig.cards.reclamacoes;

function tempoAberta(dias: number | null): string {
  if (dias === null) return "—";
  if (dias === 0) return copy.todayLabel;
  return `${dias} ${dias === 1 ? copy.dayLabel : copy.daysLabel}`;
}

/** Enquanto a API do Mercado Livre responde: silhueta das linhas, não spinner.
 *  A forma do que vem já fica na tela, então a chegada do dado não reorganiza nada. */
function Esqueleto() {
  return (
    <ul className="mt-4">
      {[0, 1, 2].map((linha) => (
        <li key={linha} className="border-b border-border px-5 py-3.5 last:border-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="shimmer h-3.5 w-24 rounded-full" />
              <div className="shimmer mt-2 h-2.5 w-32 rounded-full" />
            </div>
            <div className="shimmer h-3.5 w-10 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReclamacoesCard({ dados, carregando }: {
  dados: ReclamacoesResultado | null;
  carregando: boolean;
}) {
  const Icon = getIcon(copy.icon);
  const total = dados?.total ?? 0;

  return (
    <Card>
      <CardHead
        title={copy.title}
        subtitle={copy.subtitle}
        icon={Icon}
        accent={copy.accent}
        trailing={total > 0 ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
            style={{ background: `${copy.accent}1A`, color: copy.accent }}
          >
            {total}
          </span>
        ) : undefined}
      />

      {carregando && <Esqueleto />}

      {!carregando && dados?.semContaConectada && (
        <EmptyState
          illustration="complaints"
          title={copy.disconnectedTitle}
          description={copy.disconnectedDescription}
        />
      )}

      {!carregando && dados && !dados.semContaConectada && dados.itens.length === 0 && (
        <EmptyState
          illustration="complaints"
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      )}

      {!carregando && dados && dados.itens.length > 0 && (
        <>
          {dados.marcasComFalha.length > 0 && (
            <p className="mx-5 mt-3 rounded-lg bg-[#B57A00]/10 px-3 py-2 text-[11px] font-medium text-[#B57A00]">
              {copy.partialLabel}: {dados.marcasComFalha.join(", ")}
            </p>
          )}
          <motion.ul variants={stagger} initial="hidden" animate="show" className="mt-4">
            {dados.itens.map((item) => (
              <motion.li
                key={item.id}
                variants={listItem}
                className="border-b border-border px-5 py-3 last:border-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">{item.estagio}</span>
                      {item.emMediacao && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={{ background: `${copy.accent}1A`, color: copy.accent }}
                        >
                          escalou
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.marcaLabel}{item.motivo ? ` · ${item.motivo}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {tempoAberta(item.diasAberta)}
                    </p>
                    {item.pedidoHref ? (
                      <Link
                        href={item.pedidoHref}
                        className="press-feedback mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copy.orderLabel} <ArrowRight size={11} />
                      </Link>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{copy.openLabel}</p>
                    )}
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </>
      )}
    </Card>
  );
}
