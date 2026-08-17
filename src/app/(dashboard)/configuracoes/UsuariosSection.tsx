"use client";

import type { ComponentType, FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import permissionsConfig from "@/config/permissions.json";
import type { Perfil } from "@/shared/lib/auth/authorization";
import { cn } from "@/shared/design-system/cn";
import {
  actionAtualizarUsuario,
  actionCriarUsuarioComSenha,
  actionRedefinirSenhaUsuario,
} from "./actions";

export interface UsuarioResumo {
  id: string;
  email: string;
  nome: string;
  perfil: Perfil;
  ativo: boolean;
}

interface UsuariosSectionProps {
  usuarios: UsuarioResumo[];
  loading: boolean;
  organizationName: string | null;
  marcasAtivas: number;
  canaisConectados: number;
  canaisTotal: number;
  onUsuarioCriado: (usuario: UsuarioResumo) => void;
  onUsuarioAtualizado: (usuario: UsuarioResumo) => void;
}

type PainelModo = { tipo: "criar" } | { tipo: "senha"; usuario: UsuarioResumo };

interface FormState {
  nome: string;
  email: string;
  perfil: Perfil;
  senha: string;
}

const PERFIS = Object.entries(permissionsConfig.profiles) as Array<[
  Perfil,
  { label: string; description: string },
]>;

const perfilMap = permissionsConfig.profiles as Record<Perfil, { label: string; description: string }>;

const inputClass =
  "h-11 w-full rounded-[0.75rem] border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-[border-color,box-shadow] focus:border-primary/50 focus:shadow-[0_0_0_3px_rgba(155,48,217,.10)] disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground";

const iconButtonClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.7rem] border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

function initials(nome: string, email: string) {
  const base = nome.trim() || email.split("@")[0] || "U";
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

function escolher(chars: string) {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return chars[buffer[0] % chars.length];
}

function embaralhar(chars: string[]) {
  const resultado = [...chars];
  for (let index = resultado.length - 1; index > 0; index -= 1) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    const swapIndex = buffer[0] % (index + 1);
    [resultado[index], resultado[swapIndex]] = [resultado[swapIndex], resultado[index]];
  }
  return resultado.join("");
}

function gerarSenhaTemporaria() {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const symbols = "!@#$%&*?";
  const all = `${lower}${upper}${numbers}${symbols}`;

  return embaralhar([
    escolher(upper),
    escolher(lower),
    escolher(numbers),
    escolher(symbols),
    ...Array.from({ length: 8 }, () => escolher(all)),
  ]);
}

function medirSenha(senha: string) {
  let score = 0;
  if (senha.length >= 8) score += 1;
  if (senha.length >= 12) score += 1;
  if (/[a-zà-ÿ]/i.test(senha) && /\d/.test(senha)) score += 1;
  if (/[A-Z]/.test(senha) && /[a-zà-ÿ]/.test(senha)) score += 1;
  if (/[^A-Za-zÀ-ÿ0-9]/.test(senha)) score += 1;

  if (score >= 5) return { score, label: "Forte", color: "bg-success", width: "100%" };
  if (score >= 3) return { score, label: "Boa para primeiro acesso", color: "bg-primary", width: "72%" };
  if (score >= 2) return { score, label: "Básica", color: "bg-amber-500", width: "45%" };
  return { score, label: "Muito curta", color: "bg-destructive", width: "18%" };
}

function statusLabel(ativo: boolean) {
  return ativo ? "Ativo" : "Pausado";
}

function Field({
  label,
  icon: Icon,
  hint,
  children,
}: {
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        <Icon size={13} strokeWidth={2} />
        {label}
      </span>
      {children}
      {hint && <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

function UsuariosSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
          <div className="h-10 w-10 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 rounded-full bg-muted" />
            <div className="h-2.5 w-48 max-w-full rounded-full bg-muted" />
          </div>
          <div className="hidden h-9 w-32 rounded-[0.75rem] bg-muted sm:block" />
        </div>
      ))}
    </div>
  );
}

export function UsuariosSection({
  usuarios,
  loading,
  organizationName,
  marcasAtivas,
  canaisConectados,
  canaisTotal,
  onUsuarioCriado,
  onUsuarioAtualizado,
}: UsuariosSectionProps) {
  const [busca, setBusca] = useState("");
  const [painel, setPainel] = useState<PainelModo | null>(null);
  const [form, setForm] = useState<FormState>({ nome: "", email: "", perfil: "vendedor", senha: "" });
  const [senhaVisivel, setSenhaVisivel] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [usuarioEmAlteracao, setUsuarioEmAlteracao] = useState<string | null>(null);

  const totalAtivos = usuarios.filter((usuario) => usuario.ativo).length;
  const totalAdmins = usuarios.filter((usuario) => usuario.ativo && usuario.perfil === "admin").length;
  const senha = medirSenha(form.senha);
  const modoCriacao = painel?.tipo === "criar";
  const podeSalvar = modoCriacao
    ? form.nome.trim().length >= 2 && form.email.includes("@") && senha.score >= 2
    : senha.score >= 2;

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return usuarios;
    return usuarios.filter((usuario) =>
      `${usuario.nome} ${usuario.email} ${perfilMap[usuario.perfil].label}`.toLowerCase().includes(termo),
    );
  }, [busca, usuarios]);

  function abrirCriacao() {
    setPainel({ tipo: "criar" });
    setForm({ nome: "", email: "", perfil: "vendedor", senha: gerarSenhaTemporaria() });
    setSenhaVisivel(true);
    setCopiado(false);
    setConcluido(false);
  }

  function abrirRedefinicao(usuario: UsuarioResumo) {
    setPainel({ tipo: "senha", usuario });
    setForm({
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      senha: gerarSenhaTemporaria(),
    });
    setSenhaVisivel(true);
    setCopiado(false);
    setConcluido(false);
  }

  function fecharPainel() {
    setPainel(null);
    setForm({ nome: "", email: "", perfil: "vendedor", senha: "" });
    setCopiado(false);
    setConcluido(false);
    setSalvando(false);
  }

  async function copiarSenha() {
    try {
      await navigator.clipboard.writeText(form.senha);
      setCopiado(true);
      toast.success("Senha temporária copiada.");
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  }

  async function alterarUsuario(usuario: UsuarioResumo, perfil: Perfil, ativo: boolean) {
    setUsuarioEmAlteracao(usuario.id);
    try {
      const atualizado = await actionAtualizarUsuario({ userId: usuario.id, perfil, ativo });
      onUsuarioAtualizado(atualizado);
      toast.success("Acesso atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar este acesso.");
    } finally {
      setUsuarioEmAlteracao(null);
    }
  }

  async function salvarFormulario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!painel || !podeSalvar || concluido) return;

    setSalvando(true);
    try {
      if (painel.tipo === "criar") {
        const criado = await actionCriarUsuarioComSenha(form);
        onUsuarioCriado(criado);
        setConcluido(true);
        toast.success("Usuário criado. Copie a senha temporária para entregar o acesso.");
      } else {
        const atualizado = await actionRedefinirSenhaUsuario({ userId: painel.usuario.id, senha: form.senha });
        onUsuarioAtualizado(atualizado);
        setConcluido(true);
        toast.success("Senha redefinida. Copie a senha temporária antes de fechar.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar este usuário.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                <UsersRound size={13} />
                {organizationName ?? "Organização"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                <UserCheck size={13} />
                {totalAtivos} ativo{totalAtivos === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                <ShieldCheck size={13} />
                {totalAdmins} admin{totalAdmins === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {marcasAtivas} marca{marcasAtivas === 1 ? "" : "s"} · {canaisConectados}/{canaisTotal} canais
              </span>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Crie acessos com senha temporária, ajuste o perfil de cada pessoa e pause entradas sem apagar histórico.
            </p>
          </div>
          <button
            type="button"
            onClick={abrirCriacao}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[0.75rem] bg-primary px-4 text-sm font-bold text-white shadow-[0_4px_14px_rgba(155,48,217,.24)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <UserPlus size={17} />
            Novo usuário
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-[0.9rem] border border-border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-[0.65rem] bg-background text-muted-foreground">
              <LockKeyhole size={15} />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">A senha é entregue uma vez</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                O CRM cria ou redefine a senha no Supabase Auth, mas não salva esse texto. Copie e envie por um canal seguro.
              </p>
            </div>
          </div>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar usuário"
              className="h-10 w-full rounded-[0.75rem] border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_0_3px_rgba(155,48,217,.10)]"
            />
          </div>
        </div>

        {loading ? (
          <UsuariosSkeleton />
        ) : usuarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-[0.9rem] border border-dashed border-border py-10 text-center">
            <UsersRound className="text-muted-foreground" size={26} />
            <div>
              <p className="text-sm font-bold text-foreground">Nenhum acesso cadastrado</p>
              <p className="mt-1 text-xs text-muted-foreground">Crie o primeiro usuário para liberar entrada no CRM.</p>
            </div>
            <button
              type="button"
              onClick={abrirCriacao}
              className="inline-flex h-10 items-center gap-2 rounded-[0.75rem] bg-primary px-3.5 text-sm font-bold text-white"
            >
              <UserPlus size={16} />
              Criar usuário
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[0.9rem] border border-border">
            <div className="hidden grid-cols-[minmax(14rem,1.4fr)_minmax(12rem,1fr)_8rem_12rem] items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground md:grid">
              <span>Usuário</span>
              <span>Perfil</span>
              <span>Status</span>
              <span className="text-right">Ações</span>
            </div>
            <div className="divide-y divide-border">
              {usuariosFiltrados.map((usuario) => {
                const alterando = usuarioEmAlteracao === usuario.id;
                const perfil = perfilMap[usuario.perfil];

                return (
                  <motion.div
                    key={usuario.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(14rem,1.4fr)_minmax(12rem,1fr)_8rem_12rem] md:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn(
                        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        usuario.ativo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}>
                        {initials(usuario.nome, usuario.email)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{usuario.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <select
                        aria-label={`Perfil de ${usuario.nome}`}
                        value={usuario.perfil}
                        disabled={alterando}
                        onChange={(event) => alterarUsuario(usuario, event.target.value as Perfil, usuario.ativo)}
                        className="h-10 w-full rounded-[0.75rem] border border-border bg-background px-2.5 text-sm font-semibold text-foreground outline-none focus:border-primary/50 disabled:opacity-60"
                      >
                        {PERFIS.map(([value, dados]) => (
                          <option key={value} value={value}>{dados.label}</option>
                        ))}
                      </select>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{perfil.description}</p>
                    </div>

                    <span className={cn(
                      "inline-flex h-8 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-bold",
                      usuario.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                    )}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", usuario.ativo ? "bg-success" : "bg-muted-foreground")} />
                      {statusLabel(usuario.ativo)}
                    </span>

                    <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                      <button
                        type="button"
                        disabled={alterando}
                        onClick={() => abrirRedefinicao(usuario)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-[0.7rem] border border-border px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        <KeyRound size={14} />
                        Senha
                      </button>
                      <button
                        type="button"
                        disabled={alterando}
                        onClick={() => alterarUsuario(usuario, usuario.perfil, !usuario.ativo)}
                        className={cn(
                          "inline-flex h-10 items-center gap-1.5 rounded-[0.7rem] px-3 text-xs font-bold transition-colors disabled:opacity-50",
                          usuario.ativo
                            ? "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            : "bg-success/10 text-success hover:bg-success/15",
                        )}
                      >
                        {alterando ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : usuario.ativo ? (
                          <UserMinus size={14} />
                        ) : (
                          <UserCheck size={14} />
                        )}
                        {usuario.ativo ? "Pausar" : "Ativar"}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            {usuariosFiltrados.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum usuário encontrado com esse filtro.
              </div>
            )}
          </div>
        )}
      </div>

      <DialogPrimitive.Root open={painel !== null} onOpenChange={(open) => { if (!open) fecharPainel(); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
          <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[31rem] flex-col border-l border-border bg-card shadow-[-16px_0_40px_rgba(14,15,19,.16)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in sm:rounded-l-[1.25rem]">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
              <div className="space-y-1">
                <DialogPrimitive.Title className="flex items-center gap-2 text-base font-bold text-foreground">
                  {modoCriacao ? <UserPlus size={18} /> : <KeyRound size={18} />}
                  {modoCriacao ? "Novo usuário" : "Redefinir senha"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">
                  {modoCriacao
                    ? "Crie o login e defina uma senha temporária para o primeiro acesso."
                    : "Gere uma nova senha temporária e entregue ao usuário com segurança."}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <button type="button" aria-label="Fechar" className={iconButtonClass}>
                  <X size={18} />
                </button>
              </DialogPrimitive.Close>
            </div>

            <form onSubmit={salvarFormulario} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                {!modoCriacao && painel?.tipo === "senha" && (
                  <div className="flex items-center gap-3 rounded-[0.9rem] border border-border bg-muted/35 p-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {initials(painel.usuario.nome, painel.usuario.email)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{painel.usuario.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">{painel.usuario.email}</p>
                    </div>
                  </div>
                )}

                {modoCriacao && (
                  <>
                    <Field label="Nome" icon={User}>
                      <input
                        value={form.nome}
                        onChange={(event) => setForm((atual) => ({ ...atual, nome: event.target.value }))}
                        className={inputClass}
                        placeholder="Nome de quem vai acessar"
                        required
                        minLength={2}
                        disabled={salvando || concluido}
                      />
                    </Field>

                    <Field label="E-mail de login" icon={Mail} hint="Este e-mail será usado para entrar no CRM.">
                      <input
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm((atual) => ({ ...atual, email: event.target.value }))}
                        className={inputClass}
                        placeholder="usuario@empresa.com.br"
                        required
                        disabled={salvando || concluido}
                      />
                    </Field>

                    <Field label="Perfil" icon={ShieldCheck} hint={perfilMap[form.perfil].description}>
                      <select
                        value={form.perfil}
                        onChange={(event) => setForm((atual) => ({ ...atual, perfil: event.target.value as Perfil }))}
                        className={inputClass}
                        disabled={salvando || concluido}
                      >
                        {PERFIS.map(([value, dados]) => (
                          <option key={value} value={value}>{dados.label}</option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}

                <div className="space-y-3">
                  <Field
                    label="Senha temporária"
                    icon={LockKeyhole}
                    hint="Peça para a pessoa trocar por uma senha própria depois do primeiro acesso."
                  >
                    <div className="flex gap-2">
                      <input
                        type={senhaVisivel ? "text" : "password"}
                        value={form.senha}
                        onChange={(event) => {
                          setForm((atual) => ({ ...atual, senha: event.target.value }));
                          setCopiado(false);
                          setConcluido(false);
                        }}
                        className={cn(inputClass, "font-mono text-[13px]")}
                        placeholder="Senha temporária"
                        required
                        minLength={8}
                        disabled={salvando || concluido}
                      />
                      <button
                        type="button"
                        onClick={() => setSenhaVisivel((value) => !value)}
                        className={iconButtonClass}
                        aria-label={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {senhaVisivel ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </Field>

                  <div className="rounded-[0.9rem] border border-border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-foreground">{senha.label}</span>
                      <span className="text-[11px] text-muted-foreground">{form.senha.length} caracteres</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <span className={cn("block h-full rounded-full transition-all", senha.color)} style={{ width: senha.width }} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setForm((atual) => ({ ...atual, senha: gerarSenhaTemporaria() }));
                          setCopiado(false);
                          setConcluido(false);
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[0.65rem] border border-border px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                        disabled={salvando || concluido}
                      >
                        <RefreshCw size={13} />
                        Gerar outra
                      </button>
                      <button
                        type="button"
                        onClick={copiarSenha}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[0.65rem] border border-border px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                        disabled={!form.senha}
                      >
                        {copiado ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                        {copiado ? "Copiada" : "Copiar"}
                      </button>
                    </div>
                  </div>
                </div>

                {concluido && (
                  <div className="rounded-[0.9rem] border border-success/25 bg-success/8 p-3">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={18} />
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {modoCriacao ? "Acesso criado" : "Senha redefinida"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          A senha temporária continua visível só neste painel. Copie antes de fechar.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border px-5 py-4">
                <div className="mb-3 flex items-start gap-2 rounded-[0.75rem] bg-muted/50 px-3 py-2.5">
                  <Sparkles className="mt-0.5 shrink-0 text-primary" size={15} />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Perfil define o que a pessoa enxerga; status pausado bloqueia a entrada sem apagar histórico.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={fecharPainel}
                    className="h-11 flex-1 rounded-[0.75rem] border border-border text-sm font-bold text-foreground transition-colors hover:bg-muted"
                  >
                    {concluido ? "Fechar" : "Cancelar"}
                  </button>
                  <button
                    type="submit"
                    disabled={salvando || !podeSalvar || concluido}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[0.75rem] bg-primary text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {salvando ? <Loader2 className="animate-spin" size={16} /> : modoCriacao ? <UserPlus size={16} /> : <KeyRound size={16} />}
                    {modoCriacao ? "Criar acesso" : "Salvar senha"}
                  </button>
                </div>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
