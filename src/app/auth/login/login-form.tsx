"use client";

import { useState } from "react";
import { createClient } from "@/shared/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.login;

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });
      if (error) throw error;
      router.replace("/dashboard");
      router.refresh();
    } catch {
      toast.error(copy.errors.invalidCredentials);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
          {copy.fields.email.label}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full h-11 rounded-[0.75rem] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={copy.fields.email.placeholder}
        />
      </div>
      <div>
        <label htmlFor="senha" className="block text-sm font-medium text-foreground mb-1">
          {copy.fields.password.label}
        </label>
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full h-11 rounded-[0.75rem] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={copy.fields.password.placeholder}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 rounded-[0.75rem] font-semibold text-sm text-white disabled:opacity-60"
        style={{ background: "var(--gradient-signature)" }}
      >
        {loading ? copy.actions.submitting : copy.actions.submit}
      </button>
    </form>
  );
}
