"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/design-system/cn";
import { createClient } from "@/shared/lib/supabase/client";
import { useRouter } from "next/navigation";
import { getIcon } from "@/shared/config/icon-registry";
import appConfig from "@/config/app.json";
import brandsConfig from "@/config/brands.json";
import navigationConfig from "@/config/navigation.json";

const SettingsIcon = getIcon(navigationConfig.utilities.settings.icon);
const LogoutIcon = getIcon(navigationConfig.utilities.logout.icon);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-border">
        <span
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-sora)", background: "var(--gradient-signature)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          {appConfig.name}
        </span>
        <div className="flex gap-2 mt-1">
          {appConfig.brandOrder.map((brand) => (
            <span key={brand} className="text-[10px] font-bold uppercase tracking-widest text-foreground">
              {brandsConfig[brand as keyof typeof brandsConfig].label}
            </span>
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navigationConfig.items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = getIcon(item.icon);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[0.75rem] text-sm font-medium transition-all duration-160 min-h-[44px]",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted hover:-translate-y-px"
              )}
            >
              <Icon size={18} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-border space-y-0.5">
        <Link
          href={navigationConfig.utilities.settings.href}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-[0.75rem] text-sm font-medium transition-all duration-160 min-h-[44px]",
            pathname === navigationConfig.utilities.settings.href
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <SettingsIcon size={18} strokeWidth={1.75} />
          {navigationConfig.utilities.settings.label}
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[0.75rem] text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-muted transition-colors min-h-[44px]"
        >
          <LogoutIcon size={18} strokeWidth={1.75} />
          {navigationConfig.utilities.logout.label}
        </button>
      </div>
    </div>
  );
}
