const easeStandard: [number, number, number, number] = [0, 0, 0.2, 1];

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
