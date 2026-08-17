"use client";

import { useState } from "react";
import { createClient } from "@/shared/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { fadeUp, springs, transicao, variantes } from "@/shared/design-system/motion-variants";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.login;

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  const reduzir = useReducedMotion();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });
      if (error) throw error;
      router.replace("/metricas");
      router.refresh();
    } catch {
      setErro(copy.errors.invalidCredentials);
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
          aria-invalid={erro ? "true" : undefined}
          aria-describedby={erro ? "login-error" : undefined}
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (erro) setErro(null); }}
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
          aria-invalid={erro ? "true" : undefined}
          aria-describedby={erro ? "login-error" : undefined}
          value={senha}
          onChange={(e) => { setSenha(e.target.value); if (erro) setErro(null); }}
          className="w-full h-11 rounded-[0.75rem] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={copy.fields.password.placeholder}
        />
      </div>
      <AnimatePresence>
        {erro && (
          <motion.p
            id="login-error"
            role="alert"
            variants={variantes(reduzir, fadeUp)}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -4, transition: transicao(reduzir, springs.settleFast) }}
            className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive"
          >
            {erro}
          </motion.p>
        )}
      </AnimatePresence>
      <motion.button
        type="submit"
        disabled={loading}
        whileTap={reduzir || loading ? undefined : { scale: 0.98 }}
        transition={springs.settleFast}
        className="w-full h-11 rounded-[0.75rem] font-semibold text-sm text-white disabled:opacity-60"
        style={{ background: "var(--gradient-signature)" }}
      >
        {loading ? copy.actions.submitting : copy.actions.submit}
      </motion.button>
    </form>
  );
}
