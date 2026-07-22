"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/shared/lib/supabase/client";

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/auth/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="h-11 rounded-xl border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted"
    >
      {label}
    </button>
  );
}
