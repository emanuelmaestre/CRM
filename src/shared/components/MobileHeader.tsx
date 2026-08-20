"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/shared/lib/supabase/client";
import { ElisaLimaLogo } from "@/shared/design-system/primitives/ElisaLimaLogo";
import navigationConfig from "@/config/navigation.json";

/** Barra fixa só pro mobile — TopNav (logo, navegação, menu do avatar com
 *  "Sair") é `hidden md:block`, então abaixo de 768px não sobra nenhuma
 *  forma de sair da conta. Em vez de reaproveitar o TopNav inteiro (que traz
 *  busca, links de navegação e o menu completo — coisa demais pra essa
 *  barra), isso aqui é só identidade + sair, do jeito mais enxuto possível. */
export function MobileHeader() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between px-4 backdrop-blur-md md:hidden">
      <ElisaLimaLogo className="w-24" />
      <button
        type="button"
        onClick={handleLogout}
        aria-label={navigationConfig.utilities.logout.label}
        className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
      >
        <LogOut size={15} strokeWidth={1.9} />
        {navigationConfig.utilities.logout.label}
      </button>
    </header>
  );
}
