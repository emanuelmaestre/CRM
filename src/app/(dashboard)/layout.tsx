import { requirePageAuth } from "@/shared/lib/auth/session";
import { TopNav } from "@/shared/components/TopNav";
import { BottomNav } from "@/shared/components/BottomNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const contexto = await requirePageAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav — visível em md+ */}
      <div className="hidden md:block">
        <TopNav perfil={contexto.perfil} nome={contexto.nome} email={contexto.email} />
      </div>

      {/* Conteúdo principal */}
      <main className="md:pt-14 pb-20 md:pb-0">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6">
          {children}
        </div>
      </main>

      {/* Bottom nav — visível só em mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card">
        <BottomNav perfil={contexto.perfil} />
      </nav>
    </div>
  );
}
