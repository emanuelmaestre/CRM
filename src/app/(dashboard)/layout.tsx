import { requirePageAuth } from "@/shared/lib/auth/session";
import { TopNav } from "@/shared/components/TopNav";
import { BottomNav } from "@/shared/components/BottomNav";
import { MobileHeader } from "@/shared/components/MobileHeader";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const contexto = await requirePageAuth();

  return (
    <div className="min-h-screen min-h-dvh bg-background">
      {/* Top nav — visível em md+ */}
      <div className="hidden md:block [@media_(min-width:768px)_and_(max-height:500px)]:hidden">
        <TopNav perfil={contexto.perfil} cargo={contexto.cargo} nome={contexto.nome} email={contexto.email} modulosVisiveis={contexto.modulosVisiveis} />
      </div>

      {/* Cabeçalho mínimo (logo + sair) — só mobile, onde o TopNav não existe */}
      <MobileHeader />

      {/* Conteúdo principal */}
      <main className="pt-14 pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-0 [@media_(min-width:768px)_and_(max-height:500px)]:pb-[calc(5rem_+_env(safe-area-inset-bottom))] [@media_(min-width:768px)_and_(max-height:500px)]:pt-0">
        <div className="mx-auto w-full max-w-[1440px] px-[clamp(1rem,2.2vw,2rem)] py-[clamp(1rem,2vw,1.5rem)]">
          {children}
        </div>
      </main>

      {/* Bottom nav — visível só em mobile. Respiro extra além do próprio
          safe-area-inset-bottom: no iPhone com Dynamic Island/Face ID (Pro
          Max e afins), o ícone mais perto da borda inferior coincidia com a
          faixa de gesto do sistema, abrindo o app switcher (ou o atalho do
          assistente de voz, dependendo do aparelho/gesto) em vez de navegar.
          6px não bastava — relato real de toque acertando o gesto do
          sistema mesmo assim; subiu pra 14px. Só sobe o conteúdo — o fundo
          continua colado no rodapé, sem barra branca sobrando embaixo. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[calc(env(safe-area-inset-bottom)_+_14px)] md:hidden [@media_(min-width:768px)_and_(max-height:500px)]:block">
        <BottomNav modulosVisiveis={contexto.modulosVisiveis} />
      </nav>
    </div>
  );
}
