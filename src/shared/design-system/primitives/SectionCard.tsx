"use client";

import { useId, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../cn";
import { springs, transicao } from "../motion-variants";

interface SectionCardProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Selo curto ao lado do título (ex.: "3 de 5 conectados") — visível mesmo
   *  fechado, então uma seção recolhida no mobile não esconde a informação
   *  que faria alguém precisar abri-la. */
  resumo?: React.ReactNode;
  /** Ativa o recolher/expandir — só no mobile (`sm:` sempre aberto, o
   *  desktop nunca teve o problema de rolagem que isto resolve). Sem esta
   *  prop o card se comporta exatamente como antes, em qualquer página. */
  colapsavelMobile?: boolean;
  /** Estado inicial no mobile quando `colapsavelMobile` está ativo. Some
   *  seções (Usuários, Canais) merecem ficar abertas de cara; outras
   *  (Endpoints, Rotinas) são consulta ocasional e começam fechadas. */
  abertoInicialMobile?: boolean;
}

export function SectionCard({
  title, description, icon: Icon, actions, children, className,
  resumo, colapsavelMobile = false, abertoInicialMobile = true,
}: SectionCardProps) {
  const reduzir = useReducedMotion();
  const [abertoMobile, setAbertoMobile] = useState(abertoInicialMobile);
  const conteudoId = useId();
  const cabecalho = (
    <div className="flex min-w-0 items-center gap-2.5">
      {Icon && (
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
          <Icon size={14} strokeWidth={1.75} />
        </div>
      )}
      <div className="min-w-0">
        {title && (
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-bold tracking-[-0.01em] text-foreground">
            {title}
            {resumo && <span className="text-xs font-medium text-muted-foreground">{resumo}</span>}
          </h2>
        )}
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={transicao(reduzir, springs.settleFast)}
      className={cn(
        "rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]",
        className
      )}
    >
      {/* Título e ações sempre na MESMA linha, inclusive no celular. Antes o
          cabeçalho era `flex-col` abaixo de `sm`, o que jogava o ⓘ para uma
          linha só dele embaixo do título — um ícone solto no vazio, ocupando
          altura à toa em toda seção da página. */}
      {(title || actions) && (
        colapsavelMobile ? (
          <div className="flex items-center gap-2 border-b border-border px-4 py-4 sm:gap-3 sm:px-6">
            <button
              type="button"
              onClick={() => setAbertoMobile((atual) => !atual)}
              aria-expanded={abertoMobile}
              aria-controls={conteudoId}
              className="press-feedback flex min-h-11 min-w-0 flex-1 items-center text-left sm:pointer-events-none sm:min-h-0"
            >
              {cabecalho}
            </button>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
            {/* Decorativo: quem anuncia o estado é o botão do título acima,
                que já carrega aria-expanded/aria-controls. */}
            <motion.span
              aria-hidden="true"
              animate={{ rotate: abertoMobile ? 180 : 0 }}
              transition={transicao(reduzir, springs.settleFast)}
              className="shrink-0 text-muted-foreground sm:hidden"
            >
              <ChevronDown size={16} strokeWidth={2} />
            </motion.span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4 sm:gap-3 sm:px-6">
            {cabecalho}
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        )
      )}
      {colapsavelMobile ? (
        // Grade com linha 0fr/1fr em vez de framer-motion `height: auto`: anima
        // sem medir o conteúdo e, principalmente, sem desmontar/remontar os
        // filhos — CanaisPorMarca, UsuariosSection etc. têm o próprio fetch e
        // estado interno, então trocar de altura via mount/unmount duplicaria
        // esses efeitos (ou, pior, criaria dois <input> com o mesmo id).
        <div
          id={conteudoId}
          className={cn(
            "grid sm:grid-rows-[1fr]",
            abertoMobile ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            !reduzir && "transition-[grid-template-rows] duration-300 ease-out",
          )}
        >
          <div className="overflow-hidden">
            <div className="p-4 sm:p-6">{children}</div>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6">{children}</div>
      )}
    </motion.div>
  );
}
