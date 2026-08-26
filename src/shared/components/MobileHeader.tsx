"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/shared/lib/supabase/client";
import { ElisaLimaLogo } from "@/shared/design-system/primitives/ElisaLimaLogo";
import { getIcon } from "@/shared/config/icon-registry";
import navigationConfig from "@/config/navigation.json";
import type { ModuloId } from "@/config/modulos";
import { AtualizacaoToggle } from "@/shared/components/AtualizacaoToggle";

const SettingsIcon = getIcon(navigationConfig.utilities.settings.icon);

/** Barra fixa só pro mobile — TopNav (logo, navegação, menu do avatar com
 *  "Sair") é `hidden md:block`, então abaixo de 768px não sobra nenhuma
 *  forma de sair da conta. Em vez de reaproveitar o TopNav inteiro (que traz
 *  busca, links de navegação e o menu completo — coisa demais pra essa
 *  barra), isso aqui é só identidade + sair, do jeito mais enxuto possível. */
export function MobileHeader({ modulosVisiveis }: { modulosVisiveis: readonly ModuloId[] }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  function handleLogoClick() {
    router.push("/metricas");
    router.refresh();
  }

  return (
    <header
      className="fixed-header-stable fixed inset-x-0 top-0 z-30 flex h-[calc(3.5rem_+_env(safe-area-inset-top))] items-center justify-between px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden"
    >
      <button
        type="button"
        onClick={handleLogoClick}
        aria-label="Ir para Métricas"
        className="press-feedback rounded-lg"
      >
        <ElisaLimaLogo className="w-24" />
      </button>
      <div className="flex items-center gap-1">
        <AtualizacaoToggle modo="mobile" />
        {modulosVisiveis.includes("configuracoes") && (
          <Link
            href={navigationConfig.utilities.settings.href}
            aria-label={navigationConfig.utilities.settings.label}
            className="press-feedback inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SettingsIcon size={17} strokeWidth={1.9} />
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          aria-label={navigationConfig.utilities.logout.label}
          className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut size={15} strokeWidth={1.9} />
          {navigationConfig.utilities.logout.label}
        </button>
      </div>
    </header>
  );
}
