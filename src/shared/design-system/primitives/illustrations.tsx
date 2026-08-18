/**
 * Ilustrações SVG customizadas para EmptyState — leves (sem imagens externas),
 * usam apenas var(--muted)/var(--border)/gradiente de marca, então acompanham
 * o tema claro/escuro automaticamente.
 */

export function ClientsIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="38" width="84" height="24" rx="8" fill="var(--muted)" />
      <circle cx="44" cy="22" r="16" fill="var(--muted)" />
      <circle cx="44" cy="18" r="7" fill="var(--card)" stroke="url(#clients-grad)" strokeWidth="2" />
      <path d="M30 34c0-7.7 6.3-14 14-14s14 6.3 14 14" stroke="url(#clients-grad)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="14" cy="30" r="8" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <circle cx="74" cy="30" r="8" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <defs>
        <linearGradient id="clients-grad" x1="30" y1="14" x2="58" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ConversationIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="8" width="56" height="34" rx="10" fill="var(--muted)" />
      <path d="M18 42l-4 10 12-8" fill="var(--muted)" />
      <rect x="28" y="24" width="56" height="34" rx="10" fill="var(--card)" stroke="url(#conv-grad)" strokeWidth="2" />
      <path d="M70 58l4 6-10-4" fill="var(--card)" stroke="url(#conv-grad)" strokeWidth="2" />
      <circle cx="42" cy="41" r="2.5" fill="url(#conv-grad)" />
      <circle cx="54" cy="41" r="2.5" fill="url(#conv-grad)" />
      <circle cx="66" cy="41" r="2.5" fill="url(#conv-grad)" />
      <defs>
        <linearGradient id="conv-grad" x1="28" y1="24" x2="84" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ReportsIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="4" width="80" height="56" rx="10" fill="var(--muted)" />
      <rect x="16" y="36" width="10" height="14" rx="2" fill="var(--card)" />
      <rect x="32" y="26" width="10" height="24" rx="2" fill="var(--card)" />
      <rect x="48" y="16" width="10" height="34" rx="2" fill="url(#reports-grad)" />
      <rect x="64" y="30" width="10" height="20" rx="2" fill="var(--card)" />
      <defs>
        <linearGradient id="reports-grad" x1="48" y1="16" x2="58" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function RevenueIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="6" width="80" height="52" rx="10" fill="var(--muted)" />
      <rect x="16" y="34" width="9" height="14" rx="2.5" fill="var(--card)" />
      <rect x="30" y="27" width="9" height="21" rx="2.5" fill="var(--card)" />
      <rect x="44" y="32" width="9" height="16" rx="2.5" fill="var(--card)" />
      <rect x="58" y="18" width="9" height="30" rx="2.5" fill="url(#revenue-grad)" />
      <path d="M18 26l14-8 12 5 16-13" stroke="url(#revenue-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="60" cy="10" r="3.5" fill="var(--card)" stroke="url(#revenue-grad)" strokeWidth="2" />
      <defs>
        <linearGradient id="revenue-grad" x1="18" y1="10" x2="67" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function BestSellersIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="38" width="20" height="20" rx="4" fill="var(--muted)" />
      <rect x="62" y="44" width="20" height="14" rx="4" fill="var(--muted)" />
      <rect x="32" y="26" width="24" height="32" rx="5" fill="var(--card)" stroke="url(#best-grad)" strokeWidth="2" />
      <path d="M44 8l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2-6.5-3.4-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1L44 8z" fill="url(#best-grad)" />
      <path d="M38 42h12" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 48h7" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="best-grad" x1="32" y1="8" x2="56" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function RestockIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="46" width="76" height="4" rx="2" fill="var(--muted)" />
      <rect x="10" y="26" width="20" height="20" rx="4" fill="var(--muted)" />
      <rect x="34" y="32" width="20" height="14" rx="4" fill="var(--muted)" />
      <rect x="58" y="22" width="20" height="24" rx="4" fill="var(--card)" stroke="url(#restock-grad)" strokeWidth="2" />
      <path d="M68 6v11" stroke="url(#restock-grad)" strokeWidth="2" strokeLinecap="round" />
      <path d="M63.5 12.5L68 17l4.5-4.5" stroke="url(#restock-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M6 54h76" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="restock-grad" x1="58" y1="6" x2="80" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function SlowMovingIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="8" width="80" height="48" rx="10" fill="var(--muted)" />
      <path d="M16 22l14 9 12-3 14 10" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M56 38l10 4" stroke="url(#slow-grad)" strokeWidth="2" strokeLinecap="round" />
      <path d="M60.5 44.5L67 43l-1.5-6.5" stroke="url(#slow-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="16" cy="22" r="3" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <defs>
        <linearGradient id="slow-grad" x1="56" y1="36" x2="68" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function DeadStockIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="8" y="24" width="42" height="32" rx="6" fill="var(--muted)" />
      <path d="M8 34h42" stroke="var(--border)" strokeWidth="2" />
      <path d="M29 24v10" stroke="var(--border)" strokeWidth="2" />
      <path d="M60 12h18M60 54h18" stroke="url(#dead-grad)" strokeWidth="2" strokeLinecap="round" />
      <path d="M62 12c0 8 7 14 7 21s-7 13-7 21M76 12c0 8-7 14-7 21s7 13 7 21" stroke="url(#dead-grad)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M65 46c1.6-3 6.4-3 8 0" stroke="url(#dead-grad)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <defs>
        <linearGradient id="dead-grad" x1="60" y1="12" x2="80" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ComplaintsIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="10" width="48" height="32" rx="9" fill="var(--muted)" />
      <path d="M18 42l-3 9 11-7" fill="var(--muted)" />
      <rect x="38" y="24" width="44" height="28" rx="9" fill="var(--card)" stroke="url(#complaints-grad)" strokeWidth="2" />
      <path d="M70 52l3 8-10-4" fill="var(--card)" stroke="url(#complaints-grad)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M60 32v8" stroke="url(#complaints-grad)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="45" r="1.75" fill="url(#complaints-grad)" />
      <defs>
        <linearGradient id="complaints-grad" x1="38" y1="24" x2="82" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* Estoque sem régua: as caixas existem, o limiar não. A linha tracejada é o
   estoque mínimo que ninguém definiu — sem ela o alerta nunca dispara. Usada no
   filtro "Sem mínimo" e no vazio do wizard de alertas. */
export function NoThresholdIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="52" width="76" height="4" rx="2" fill="var(--muted)" />
      <rect x="10" y="30" width="18" height="22" rx="4" fill="var(--muted)" />
      <rect x="32" y="38" width="18" height="14" rx="4" fill="var(--muted)" />
      <rect x="54" y="26" width="18" height="26" rx="4" fill="var(--muted)" />
      <path d="M6 18h68" stroke="url(#nothreshold-grad)" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 6" />
      <circle cx="80" cy="18" r="3.5" fill="var(--card)" stroke="url(#nothreshold-grad)" strokeWidth="2" />
      <defs>
        <linearGradient id="nothreshold-grad" x1="6" y1="14" x2="80" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* Contraponto da anterior: régua definida e nada abaixo dela. Vazio aqui é boa
   notícia, então não pode reusar a ilustração de "ajuste seus filtros". */
export function HealthyStockIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="52" width="76" height="4" rx="2" fill="var(--muted)" />
      <rect x="10" y="28" width="18" height="24" rx="4" fill="var(--muted)" />
      <rect x="32" y="34" width="18" height="18" rx="4" fill="var(--muted)" />
      <rect x="54" y="24" width="18" height="28" rx="4" fill="var(--card)" stroke="url(#healthy-grad)" strokeWidth="2" />
      <path d="M6 18h56" stroke="url(#healthy-grad)" strokeWidth="2" strokeLinecap="round" />
      <path d="M68 14.5l3.6 4L80 9" stroke="url(#healthy-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <defs>
        <linearGradient id="healthy-grad" x1="6" y1="9" x2="80" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function GenericIllustration() {
  return (
    <svg width="88" height="64" viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 26l30-14 30 14v24l-30 10-30-10V26z" fill="var(--muted)" />
      <path d="M14 26l30 12 30-12M44 38v24" stroke="var(--border)" strokeWidth="2" strokeLinejoin="round" fill="none" />
      <circle cx="44" cy="14" r="6" fill="url(#generic-grad)" />
      <defs>
        <linearGradient id="generic-grad" x1="38" y1="8" x2="50" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--karzi)" />
          <stop offset="1" stopColor="var(--selecionado)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
