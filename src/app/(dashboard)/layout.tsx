import { requirePageAuth } from "@/shared/lib/auth/session";
import { TopNav } from "@/shared/components/TopNav";
import { BottomNav } from "@/shared/components/BottomNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const contexto = await requirePageAuth();

  return (
    <div className="min-h-screen min-h-dvh bg-background">
      {/* Top nav — visível em md+ */}
      <div className="hidden md:block [@media_(min-width:768px)_and_(max-height:500px)]:hidden">
        <TopNav perfil={contexto.perfil} cargo={contexto.cargo} nome={contexto.nome} email={contexto.email} modulosVisiveis={contexto.modulosVisiveis} />
      </div>

      {/* Conteúdo principal */}
      <main className="pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pt-14 md:pb-0 [@media_(min-width:768px)_and_(max-height:500px)]:pb-[calc(5rem_+_env(safe-area-inset-bottom))] [@media_(min-width:768px)_and_(max-height:500px)]:pt-0">
        <div className="mx-auto w-full max-w-[1440px] px-[clamp(1rem,2.2vw,2rem)] py-[clamp(1rem,2vw,1.5rem)]">
          {children}
        </div>
      </main>

      {/* Bottom nav — visível só em mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden [@media_(min-width:768px)_and_(max-height:500px)]:block">
        <BottomNav modulosVisiveis={contexto.modulosVisiveis} />
      </nav>
    </div>
  );
}
