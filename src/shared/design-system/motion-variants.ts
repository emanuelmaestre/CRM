/**
 * Spring presets seguindo a nomenclatura da Apple (Designing Fluid Interfaces, WWDC18):
 * damping = 1.0 é crítico (sem overshoot), <1.0 tem bounce. response = tempo até o alvo, em segundos.
 * Usar `settle` para qualquer UI que apenas entra/sai; `momentum` só quando o próprio gesto
 * (arrastar, soltar, flick) já carregava velocidade.
 */
export const springs = {
  settle: { type: "spring" as const, bounce: 0, duration: 0.4 },
  settleFast: { type: "spring" as const, bounce: 0, duration: 0.3 },
  momentum: { type: "spring" as const, bounce: 0.2, duration: 0.4 },
  drawer: { type: "spring" as const, bounce: 0.2, duration: 0.3 },
};

/**
 * Eases não-spring, para casos onde a curva precisa ser fixa (ex: preenchimento
 * de barra até um valor calculado, entrada de texto). Nomes seguem o uso já
 * predominante no código antes desta padronização — não são valores novos.
 */
export const eases = {
  /** Desaceleração padrão (Material "standard"). Uso mais comum do projeto. */
  standard: [0, 0, 0.2, 1] as const,
  /** Saída mais suave e alongada, para transições de destaque/maior duração. */
  emphasized: [0.22, 1, 0.36, 1] as const,
};

/**
 * Durations soltas (sem spring), para usar com `eases` acima.
 * quick = microinteração (hover/tap/toggle), base = transição padrão de UI,
 * relaxed = entrada com mais destaque (cards grandes, seções).
 */
export const durations = {
  quick: 0.15,
  base: 0.2,
  relaxed: 0.3,
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 6, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: springs.settleFast },
};

export const listItem = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: springs.settleFast },
};

/** Para elementos cujo gesto de entrada carrega momentum real (flick, soltar após arrastar). */
export const fadeUpMomentum = {
  hidden: { opacity: 0, y: 6, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: springs.momentum },
};

/* ── Movimento reduzido ────────────────────────────────────────────
   A regra @media (prefers-reduced-motion: reduce) no globals.css zera
   animações e transições de CSS — e dá uma falsa sensação de cobertura,
   porque o Framer Motion anima em JavaScript e não é afetado por ela.
   Cada motion.div continua fazendo spring, stagger e desenho de traço
   normalmente para quem pediu ao sistema operacional que parasse.

   As duas peças abaixo existem para que respeitar a preferência custe uma
   linha por componente, em vez de um `useReducedMotion()` e três ternários
   espalhados pelo JSX. */

/** Variantes que entregam o estado final sem percorrer o caminho: o
 *  conteúdo aparece, apenas sem deslizar nem escalar. */
export const semMovimento = {
  hidden: { opacity: 1, y: 0, x: 0, scale: 1 },
  show: { opacity: 1, y: 0, x: 0, scale: 1, transition: { duration: 0 } },
};

/** Escolhe entre a variante animada e a estática. `reduzir` vem do
 *  `useReducedMotion()` do próprio Framer, que já observa a media query. */
export function variantes<T>(reduzir: boolean | null, animada: T): T | typeof semMovimento {
  return reduzir ? semMovimento : animada;
}

/** Mesma ideia para transições soltas (`transition={...}`). */
export function transicao<T>(reduzir: boolean | null, animada: T): T | { duration: 0 } {
  return reduzir ? { duration: 0 } : animada;
}

/** Stagger só faz sentido quando há movimento — sem ele, escalonar a entrada
 *  de 12 linhas vira só um atraso sem propósito para quem não vê animação. */
export function escalonamento(reduzir: boolean | null) {
  return reduzir ? { hidden: {}, show: { transition: { staggerChildren: 0 } } } : stagger;
}
