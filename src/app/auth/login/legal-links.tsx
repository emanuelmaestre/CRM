import Link from "next/link";

export function LegalLinks() {
  return (
    <nav
      aria-label="Documentos legais"
      className="mt-3 flex items-center justify-center gap-5 text-[13px] font-medium text-muted-foreground"
    >
      <Link href="/terms" className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        Termos
      </Link>
      <Link href="/privacy" className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        Privacidade
      </Link>
    </nav>
  );
}
