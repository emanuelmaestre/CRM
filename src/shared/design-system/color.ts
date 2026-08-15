/* ── Tinta translúcida ────────────────────────────────────────────
   O padrão antigo espalhado pelas telas era concatenar alfa em hex:
   `${cor}18`. Isso só funciona enquanto `cor` for um hex literal — no
   instante em que passa a ser `var(--success)`, a concatenação produz
   "var(--success)18", que não é cor válida e o navegador descarta em
   silêncio: o fundo simplesmente some, sem erro no console.

   `color-mix` resolve porque opera sobre a cor já resolvida, seja ela
   literal ou variável — e continua funcionando quando o token muda de
   valor entre os temas Vitrine e Cabine. */

/** Mesma cor, translúcida. `percentual` é a opacidade (0–100). */
export function tint(cor: string, percentual: number): string {
  return `color-mix(in srgb, ${cor} ${percentual}%, transparent)`;
}

/** Opacidades nomeadas, para as telas pararem de escolher 8%, 9%, 10% e
 *  12% para a mesma intenção visual (a auditoria encontrou seis variações
 *  do mesmo vermelho). */
export const TINTA = {
  /** Fundo de chip/badge atrás de texto da mesma cor. */
  chip: 9,
  /** Fundo de bloco de aviso, um pouco mais presente que o chip. */
  bloco: 12,
  /** Borda tonal. */
  borda: 33,
  /** Halo/sombra colorida. */
  halo: 40,
} as const;
