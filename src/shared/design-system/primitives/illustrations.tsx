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
          <stop stopColor="#E3131B" />
          <stop offset="1" stopColor="#9B30D9" />
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
          <stop stopColor="#E3131B" />
          <stop offset="1" stopColor="#9B30D9" />
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
          <stop stopColor="#E3131B" />
          <stop offset="1" stopColor="#9B30D9" />
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
          <stop stopColor="#E3131B" />
          <stop offset="1" stopColor="#9B30D9" />
        </linearGradient>
      </defs>
    </svg>
  );
}
