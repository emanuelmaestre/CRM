const easeStandard: [number, number, number, number] = [0, 0, 0.2, 1];

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 6, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: easeStandard } },
};

export const listItem = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: easeStandard } },
};
