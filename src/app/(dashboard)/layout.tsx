import { requirePageAuth } from "@/shared/lib/auth/session";
import { TopNav } from "@/shared/components/TopNav";
import { BottomNav } from "@/shared/components/BottomNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const contexto = await requirePageAuth();

  return (
    <div className="min-h-screen min-h-dvh bg-background">
      {/* Top nav — visível em md+ */}
      <div className="hidden md:block">
        <TopNav perfil={contexto.perfil} nome={contexto.nome} email={contexto.email} />
      </div>

      {/* Conteúdo principal */}
      <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pt-14 md:pb-0">
        <div className="mx-auto w-full max-w-[1440px] px-[clamp(1rem,2.2vw,2rem)] py-[clamp(1rem,2vw,1.5rem)]">
          {children}
        </div>
      </main>

      {/* Bottom nav — visível só em mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        <BottomNav perfil={contexto.perfil} />
      </nav>
    </div>
  );
}
