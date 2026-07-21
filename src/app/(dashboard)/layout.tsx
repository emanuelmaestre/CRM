import { redirect } from "next/navigation";
import { createClient } from "@/shared/lib/supabase/server";
import { Sidebar } from "@/shared/components/Sidebar";
import { BottomNav } from "@/shared/components/BottomNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — visível em md+ */}
      <aside className="hidden md:flex md:w-64 lg:w-64 xl:w-64 flex-col border-r border-border bg-card fixed inset-y-0 left-0 z-30">
        <Sidebar />
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 md:ml-64 pb-20 md:pb-0">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6">
          {children}
        </div>
      </main>

      {/* Bottom nav — visível só em mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card">
        <BottomNav />
      </nav>
    </div>
  );
}
