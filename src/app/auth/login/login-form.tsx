"use client";

import { useState } from "react";
import { createClient } from "@/shared/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { escalonamento, fadeUp, springs, transicao, variantes } from "@/shared/design-system/motion-variants";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.login;

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
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
    <motion.form
      onSubmit={handleSubmit}
      className="space-y-4"
      variants={escalonamento(reduzir)}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={variantes(reduzir, fadeUp)}>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
          {copy.fields.email.label}
        </label>
        <div className="relative">
          <Mail size={17} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={erro ? "true" : undefined}
            aria-describedby={erro ? "login-error" : undefined}
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (erro) setErro(null); }}
            className="w-full h-12 rounded-[0.75rem] border border-border bg-background/60 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring focus:bg-card"
            placeholder={copy.fields.email.placeholder}
          />
        </div>
      </motion.div>

      <motion.div variants={variantes(reduzir, fadeUp)}>
        <label htmlFor="senha" className="block text-sm font-medium text-foreground mb-1.5">
          {copy.fields.password.label}
        </label>
        <div className="relative">
          <Lock size={17} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="senha"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={erro ? "true" : undefined}
            aria-describedby={erro ? "login-error" : undefined}
            value={senha}
            onChange={(e) => { setSenha(e.target.value); if (erro) setErro(null); }}
            className="w-full h-12 rounded-[0.75rem] border border-border bg-background/60 pl-10 pr-11 text-sm text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring focus:bg-card"
            placeholder={copy.fields.password.placeholder}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={mostrarSenha}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={mostrarSenha ? "aberto" : "fechado"}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: reduzir ? 0 : 0.12 }}
                className="flex"
              >
                {mostrarSenha ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </motion.div>

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
        variants={variantes(reduzir, fadeUp)}
        whileHover={reduzir || loading ? undefined : { scale: 1.01 }}
        whileTap={reduzir || loading ? undefined : { scale: 0.98 }}
        transition={springs.settleFast}
        className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-[0.75rem] font-semibold text-sm text-primary-foreground disabled:opacity-60"
        style={{ background: "var(--primary)" }}
      >
        {/* Brilho diagonal que atravessa o botão no hover — só decoração, some com movimento reduzido. */}
        {!reduzir && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/15 opacity-0 transition-[transform,opacity] duration-500 group-hover:translate-x-[220%] group-hover:opacity-100"
          />
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={loading ? "carregando" : "entrar"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: reduzir ? 0 : 0.15 }}
            className="inline-flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                {copy.actions.submitting}
              </>
            ) : (
              <>
                {copy.actions.submit}
                <ArrowRight size={16} strokeWidth={2.4} className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </motion.form>
  );
}
