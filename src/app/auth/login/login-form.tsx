"use client";

import { useState } from "react";
import { createClient } from "@/shared/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { eases, escalonamento, fadeUp, springs, transicao, variantes } from "@/shared/design-system/motion-variants";
import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.login;

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  const reduzir = useReducedMotion();
  const travado = loading || sucesso;

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
      setLoading(false);
      setSucesso(true);
      // Segura a tela no estado de sucesso por um instante antes de navegar —
      // tempo suficiente pra animação do botão (morph + check) ser percebida
      // sem virar um atraso perceptível no fluxo de login.
      window.setTimeout(() => {
        router.replace("/metricas");
        router.refresh();
      }, reduzir ? 150 : 900);
    } catch {
      setLoading(false);
      setErro(copy.errors.invalidCredentials);
      toast.error(copy.errors.invalidCredentials);
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
      <motion.div
        animate={
          sucesso
            ? { opacity: 0.35, filter: "blur(3px)", scale: 0.99 }
            : { opacity: 1, filter: "blur(0px)", scale: 1 }
        }
        transition={transicao(reduzir, springs.settleFast)}
        className="space-y-4"
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
              disabled={travado}
              aria-invalid={erro ? "true" : undefined}
              aria-describedby={erro ? "login-error" : undefined}
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (erro) setErro(null); }}
              className="w-full h-12 rounded-[0.75rem] border border-foreground/20 bg-background/60 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring focus:bg-card disabled:cursor-default"
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
              disabled={travado}
              aria-invalid={erro ? "true" : undefined}
              aria-describedby={erro ? "login-error" : undefined}
              value={senha}
              onChange={(e) => { setSenha(e.target.value); if (erro) setErro(null); }}
              className="w-full h-12 rounded-[0.75rem] border border-foreground/20 bg-background/60 pl-10 pr-11 text-sm text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring focus:bg-card disabled:cursor-default"
              placeholder={copy.fields.password.placeholder}
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              disabled={travado}
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={mostrarSenha}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
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
      </motion.div>

      <motion.div variants={variantes(reduzir, fadeUp)} className="flex flex-col items-center gap-3">
        <motion.button
          type="submit"
          disabled={travado}
          animate={
            sucesso
              ? { width: 48, borderRadius: 24 }
              : { width: "100%", borderRadius: 12 }
          }
          transition={transicao(reduzir, springs.settle)}
          whileHover={reduzir || travado ? undefined : { scale: 1.01 }}
          whileTap={reduzir || travado ? undefined : { scale: 0.98 }}
          className="group relative flex h-12 items-center justify-center gap-2 overflow-hidden font-semibold text-sm text-primary-foreground disabled:cursor-default"
          style={{ background: sucesso ? "var(--success)" : "var(--primary)" }}
        >
          {/* Brilho diagonal que atravessa o botão no hover — só decoração, some com movimento reduzido ou após o sucesso. */}
          {!reduzir && !sucesso && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/15 opacity-0 transition-[transform,opacity] duration-500 group-hover:translate-x-[220%] group-hover:opacity-100"
            />
          )}
          {/* Onda de confirmação — expande e desaparece a partir do centro assim que o sucesso é sinalizado. */}
          {sucesso && !reduzir && (
            <motion.span
              aria-hidden
              initial={{ scale: 0, opacity: 0.5 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ duration: 0.6, ease: eases.standard }}
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: "var(--success)" }}
            />
          )}
          <AnimatePresence mode="wait" initial={false}>
            {sucesso ? (
              <motion.span
                key="sucesso"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reduzir ? 0 : 0.2, delay: reduzir ? 0 : 0.1 }}
                className="flex"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <motion.path
                    d="M4.5 12.5L9.5 17.5L19.5 6.5"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: reduzir ? 1 : 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: reduzir ? 0 : 0.35, ease: eases.standard, delay: reduzir ? 0 : 0.15 }}
                  />
                </svg>
              </motion.span>
            ) : (
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
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>
    </motion.form>
  );
}
