"use client";

import type { ComponentType, FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LayoutGrid,
  Loader2,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
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
import { MODULOS_CATALOGO, MODULOS_TODOS, normalizarModulos, type ModuloId } from "@/config/modulos";
import { getIcon } from "@/shared/config/icon-registry";
import { cn } from "@/shared/design-system/cn";
import { tint } from "@/shared/design-system/color";
import {
  actionAtualizarModulosUsuario,
  actionAtualizarUsuario,
  actionCriarUsuarioComSenha,
  actionExcluirUsuario,
  actionRedefinirSenhaUsuario,
  actionRenomearUsuario,
} from "./actions";

// Cor única de identidade pra qualquer cargo — mesmo princípio de "cada
// marca tinge com a própria cor" usado no resto do sistema (ver
// scope-row.tsx), só que agora por pessoa, não por perfil: perfil é sempre
// "admin" pra quem é criado hoje em diante, então deixou de servir como
// diferenciador visual da lista.
const CARGO_COR = "var(--primary)";

/** Sugestões de cargo — atalho de um clique, não uma lista fechada. Quem
 *  cria o usuário pode digitar qualquer outra coisa no campo. */
const CARGOS_SUGERIDOS = ["Desenvolvedor", "Diretor", "Publicitário"];

export interface UsuarioResumo {
  id: string;
  email: string;
  nome: string;
  perfil: Perfil;
  cargo: string | null;
  modulosVisiveis: unknown;
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
  onUsuarioExcluido: (userId: string) => void;
}

type PainelModo =
  | { tipo: "criar" }
  | { tipo: "senha"; usuario: UsuarioResumo }
  | { tipo: "modulos"; usuario: UsuarioResumo };

interface FormState {
  nome: string;
  email: string;
  cargo: string;
  modulosVisiveis: ModuloId[];
  senha: string;
}

const perfilMap = permissionsConfig.profiles as Record<Perfil, { label: string; description: string }>;

function alternarModulo(atual: ModuloId[], id: ModuloId): ModuloId[] {
  return atual.includes(id) ? atual.filter((m) => m !== id) : [...atual, id];
}

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
  onUsuarioExcluido,
}: UsuariosSectionProps) {
  const reduzir = useReducedMotion();
  const [busca, setBusca] = useState("");
  const [painel, setPainel] = useState<PainelModo | null>(null);
  const [form, setForm] = useState<FormState>({ nome: "", email: "", cargo: "", modulosVisiveis: [...MODULOS_TODOS], senha: "" });
  const [senhaVisivel, setSenhaVisivel] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [usuarioEmAlteracao, setUsuarioEmAlteracao] = useState<string | null>(null);
  const [usuarioParaExcluir, setUsuarioParaExcluir] = useState<UsuarioResumo | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [usuarioParaRenomear, setUsuarioParaRenomear] = useState<UsuarioResumo | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [renomeando, setRenomeando] = useState(false);

  const totalAtivos = usuarios.filter((usuario) => usuario.ativo).length;
  const senha = medirSenha(form.senha);
  const modoCriacao = painel?.tipo === "criar";
  const modoModulos = painel?.tipo === "modulos";
  const cargoValido = form.cargo.trim().length >= 2;
  const podeSalvar = modoCriacao
    ? form.nome.trim().length >= 2 && form.email.includes("@") && senha.score >= 2 && cargoValido && form.modulosVisiveis.length >= 1
    : modoModulos
    ? cargoValido && form.modulosVisiveis.length >= 1
    : senha.score >= 2;

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return usuarios;
    return usuarios.filter((usuario) =>
      `${usuario.nome} ${usuario.email} ${usuario.cargo ?? perfilMap[usuario.perfil].label}`.toLowerCase().includes(termo),
    );
  }, [busca, usuarios]);

  function abrirCriacao() {
    setPainel({ tipo: "criar" });
    setForm({ nome: "", email: "", cargo: "", modulosVisiveis: [...MODULOS_TODOS], senha: gerarSenhaTemporaria() });
    setSenhaVisivel(true);
    setCopiado(false);
    setConcluido(false);
  }

  function abrirRedefinicao(usuario: UsuarioResumo) {
    setPainel({ tipo: "senha", usuario });
    setForm({
      nome: usuario.nome,
      email: usuario.email,
      cargo: usuario.cargo ?? "",
      modulosVisiveis: normalizarModulos(usuario.modulosVisiveis),
      senha: gerarSenhaTemporaria(),
    });
    setSenhaVisivel(true);
    setCopiado(false);
    setConcluido(false);
  }

  function abrirEdicaoModulos(usuario: UsuarioResumo) {
    setPainel({ tipo: "modulos", usuario });
    setForm({
      nome: usuario.nome,
      email: usuario.email,
      cargo: usuario.cargo ?? "",
      modulosVisiveis: normalizarModulos(usuario.modulosVisiveis),
      senha: "",
    });
    setCopiado(false);
    setConcluido(false);
  }

  function fecharPainel() {
    setPainel(null);
    setForm({ nome: "", email: "", cargo: "", modulosVisiveis: [...MODULOS_TODOS], senha: "" });
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

  async function alternarAtivo(usuario: UsuarioResumo) {
    setUsuarioEmAlteracao(usuario.id);
    try {
      const atualizado = await actionAtualizarUsuario({ userId: usuario.id, perfil: "admin", ativo: !usuario.ativo });
      onUsuarioAtualizado(atualizado);
      toast.success(atualizado.ativo ? "Acesso reativado." : "Acesso pausado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar este acesso.");
    } finally {
      setUsuarioEmAlteracao(null);
    }
  }

  function abrirRenomeacao(usuario: UsuarioResumo) {
    setUsuarioParaRenomear(usuario);
    setNovoNome(usuario.nome);
  }

  async function confirmarRenomeacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!usuarioParaRenomear || novoNome.trim().length < 2) return;
    setRenomeando(true);
    try {
      const atualizado = await actionRenomearUsuario({ userId: usuarioParaRenomear.id, nome: novoNome.trim() });
      onUsuarioAtualizado(atualizado);
      toast.success("Nome atualizado.");
      setUsuarioParaRenomear(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível renomear este usuário.");
    } finally {
      setRenomeando(false);
    }
  }

  async function confirmarExclusao() {
    if (!usuarioParaExcluir) return;
    setExcluindo(true);
    try {
      const resultado = await actionExcluirUsuario({ userId: usuarioParaExcluir.id });
      onUsuarioExcluido(usuarioParaExcluir.id);
      toast.success(
        resultado.excluidoDeVerdade
          ? "Usuário excluído."
          : "O login foi removido. Como este usuário tem histórico vinculado (anotações, pedidos ou mensagens), o registro ficou anonimizado em vez de apagado — é o que preserva esse histórico.",
      );
      setUsuarioParaExcluir(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir este usuário.");
    } finally {
      setExcluindo(false);
    }
  }

  async function salvarFormulario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!painel || !podeSalvar || concluido) return;

    setSalvando(true);
    try {
      if (painel.tipo === "criar") {
        const criado = await actionCriarUsuarioComSenha({
          nome: form.nome,
          email: form.email,
          cargo: form.cargo.trim(),
          modulosVisiveis: form.modulosVisiveis,
          senha: form.senha,
        });
        onUsuarioCriado(criado);
        setConcluido(true);
        toast.success("Usuário criado. Copie a senha temporária para entregar o acesso.");
      } else if (painel.tipo === "modulos") {
        const atualizado = await actionAtualizarModulosUsuario({
          userId: painel.usuario.id,
          cargo: form.cargo.trim(),
          modulosVisiveis: form.modulosVisiveis,
        });
        onUsuarioAtualizado(atualizado);
        toast.success("Cargo e módulos atualizados.");
        fecharPainel();
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
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-semibold text-foreground">
              <UsersRound size={13} />
              {organizationName ?? "Organização"}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: tint("var(--success)", 10), color: "var(--success)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {totalAtivos} ativo{totalAtivos === 1 ? "" : "s"}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: tint(CARGO_COR, 10), color: CARGO_COR }}
            >
              <ShieldCheck size={12} />
              {usuarios.length} acesso{usuarios.length === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {marcasAtivas} marca{marcasAtivas === 1 ? "" : "s"} · {canaisConectados}/{canaisTotal} canais
            </span>
            <span
              className="ml-0.5 inline-flex shrink-0 text-muted-foreground"
              title="Senhas temporárias aparecem só no painel de criação ou redefinição. Depois disso, o CRM não salva o texto."
            >
              <LockKeyhole size={13} aria-hidden="true" />
              <span className="sr-only">Senhas temporárias aparecem só no painel de criação ou redefinição. Depois disso, o CRM não salva o texto.</span>
            </span>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar usuário"
                className="h-10 w-full rounded-[0.65rem] border border-border bg-transparent pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-[border-color,box-shadow] focus:border-primary/50 focus:shadow-[0_0_0_3px_rgba(155,48,217,.10)]"
              />
            </div>
            <button
              type="button"
              onClick={abrirCriacao}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.65rem] bg-foreground px-3.5 text-sm font-semibold text-background shadow-none transition-colors hover:bg-foreground/90 disabled:opacity-60"
            >
              <UserPlus size={16} />
              Novo usuário
            </button>
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
          <div className="overflow-hidden border-y border-border">
            <div className="hidden grid-cols-[minmax(12rem,1.6fr)_11rem_5rem] items-center gap-3 border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground md:grid">
              <span>Usuário</span>
              <span>Cargo · Módulos</span>
              <span className="text-right">Ações</span>
            </div>
            <div className="divide-y divide-border">
              {usuariosFiltrados.map((usuario) => {
                const alterando = usuarioEmAlteracao === usuario.id;
                const modulosDoUsuario = normalizarModulos(usuario.modulosVisiveis);
                const rotuloCargo = usuario.cargo || perfilMap[usuario.perfil].label;

                return (
                  <motion.div
                    key={usuario.id}
                    initial={reduzir ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "grid gap-3 px-3 py-3 transition-colors hover:bg-muted/20 md:grid-cols-[minmax(12rem,1.6fr)_11rem_5rem] md:items-center",
                      !usuario.ativo && "opacity-60",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="relative inline-flex h-9 w-9 shrink-0">
                        <span
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold"
                          style={{ background: tint(CARGO_COR, usuario.ativo ? 14 : 8), color: usuario.ativo ? CARGO_COR : "var(--muted-foreground)" }}
                        >
                          {initials(usuario.nome, usuario.email)}
                        </span>
                        <span
                          title={statusLabel(usuario.ativo)}
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                            usuario.ativo ? "bg-success" : "bg-muted-foreground",
                          )}
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{usuario.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => abrirEdicaoModulos(usuario)}
                      disabled={alterando}
                      title="Editar cargo e módulos visíveis"
                      className="press-feedback inline-flex w-fit items-center gap-1.5 rounded-full border border-transparent py-1 pl-2.5 pr-1.5 text-xs font-bold outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-60"
                      style={{ color: CARGO_COR, background: tint(CARGO_COR, 9) }}
                    >
                      {rotuloCargo}
                      <span className="inline-flex items-center gap-1 rounded-full bg-card/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                        {modulosDoUsuario.length}/{MODULOS_CATALOGO.length}
                        <Pencil size={9} />
                      </span>
                    </button>

                    <div className="flex items-center justify-start gap-1 md:justify-end">
                      <button
                        type="button"
                        disabled={alterando}
                        onClick={() => alternarAtivo(usuario)}
                        aria-label={usuario.ativo ? `Pausar ${usuario.nome}` : `Ativar ${usuario.nome}`}
                        title={usuario.ativo ? "Pausar" : "Ativar"}
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-[0.6rem] border border-transparent transition-colors disabled:opacity-50",
                          usuario.ativo
                            ? "text-muted-foreground hover:border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
                            : "text-success hover:border-success/20 hover:bg-success/10",
                        )}
                      >
                        {alterando ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : usuario.ativo ? (
                          <UserMinus size={14} />
                        ) : (
                          <UserCheck size={14} />
                        )}
                      </button>

                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            disabled={alterando}
                            aria-label={`Mais ações para ${usuario.nome}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[0.6rem] border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground disabled:opacity-50"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            sideOffset={6}
                            className="z-[100] min-w-[10rem] rounded-[0.7rem] border border-border bg-card p-1 shadow-[0_16px_40px_rgba(14,15,19,.16)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
                          >
                            <DropdownMenu.Item
                              onSelect={() => abrirRenomeacao(usuario)}
                              className="flex cursor-pointer items-center gap-2 rounded-[0.45rem] px-2.5 py-2 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus:bg-muted"
                            >
                              <Pencil size={14} />
                              Renomear
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              onSelect={() => abrirRedefinicao(usuario)}
                              className="flex cursor-pointer items-center gap-2 rounded-[0.45rem] px-2.5 py-2 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus:bg-muted"
                            >
                              <KeyRound size={14} />
                              Redefinir senha
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              onSelect={() => setUsuarioParaExcluir(usuario)}
                              className="flex cursor-pointer items-center gap-2 rounded-[0.45rem] px-2.5 py-2 text-xs font-semibold text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
                            >
                              <Trash2 size={14} />
                              Excluir
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
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
                  {modoCriacao ? <UserPlus size={18} /> : modoModulos ? <LayoutGrid size={18} /> : <KeyRound size={18} />}
                  {modoCriacao ? "Novo usuário" : modoModulos ? "Cargo e módulos" : "Redefinir senha"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">
                  {modoCriacao
                    ? "Crie o login, escolha o cargo e o que essa pessoa vai enxergar no menu."
                    : modoModulos
                    ? "Ajuste o cargo e quais módulos aparecem para esta pessoa."
                    : "Gere uma nova senha temporária e entregue ao usuário com segurança."}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <button type="button" aria-label="Fechar" className={iconButtonClass}>
                  <X size={16} />
                </button>
              </DialogPrimitive.Close>
            </div>

            <form onSubmit={salvarFormulario} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                {!modoCriacao && (painel?.tipo === "senha" || painel?.tipo === "modulos") && (
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

                  </>
                )}

                {(modoCriacao || modoModulos) && (
                  <>
                    <Field label="Cargo" icon={ShieldCheck} hint="Rótulo livre — aparece no menu da pessoa e na lista de usuários.">
                      <input
                        value={form.cargo}
                        onChange={(event) => setForm((atual) => ({ ...atual, cargo: event.target.value }))}
                        className={inputClass}
                        placeholder="Ex.: Diretor, Publicitário…"
                        required
                        minLength={2}
                        maxLength={60}
                        disabled={salvando}
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {CARGOS_SUGERIDOS.map((sugestao) => (
                          <button
                            key={sugestao}
                            type="button"
                            onClick={() => setForm((atual) => ({ ...atual, cargo: sugestao }))}
                            disabled={salvando}
                            className={cn(
                              "press-feedback rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
                              form.cargo === sugestao
                                ? "border-transparent text-white"
                                : "border-border text-muted-foreground hover:bg-muted",
                            )}
                            style={form.cargo === sugestao ? { background: CARGO_COR } : undefined}
                          >
                            {sugestao}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field
                      label="Módulos visíveis"
                      icon={LayoutGrid}
                      hint="O que fica marcado aparece no menu dessa pessoa — o resto some, sem afetar o que ela pode fazer nos módulos que enxerga."
                    >
                      <div className="grid grid-cols-2 gap-2">
                        {MODULOS_CATALOGO.map((modulo) => {
                          const Icone = getIcon(modulo.icon);
                          const marcado = form.modulosVisiveis.includes(modulo.id);
                          return (
                            <motion.button
                              key={modulo.id}
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              disabled={salvando}
                              onClick={() =>
                                setForm((atual) => ({ ...atual, modulosVisiveis: alternarModulo(atual.modulosVisiveis, modulo.id) }))
                              }
                              aria-pressed={marcado}
                              className={cn(
                                "flex items-center gap-2 rounded-[0.75rem] border px-2.5 py-2 text-left text-xs font-semibold transition-colors disabled:opacity-50",
                                marcado ? "border-transparent bg-primary/8 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                                style={{ background: tint(CARGO_COR, marcado ? 16 : 8), color: marcado ? CARGO_COR : "var(--muted-foreground)" }}
                              >
                                <Icone size={12} strokeWidth={2} />
                              </span>
                              <span className="min-w-0 flex-1 truncate">{modulo.label}</span>
                              <motion.span
                                initial={false}
                                animate={{ scale: marcado ? 1 : 0, opacity: marcado ? 1 : 0 }}
                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white"
                                style={{ background: CARGO_COR }}
                              >
                                <CheckCircle2 size={11} strokeWidth={3} />
                              </motion.span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </Field>
                  </>
                )}

                {!modoModulos && (
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
                          {senhaVisivel ? <EyeOff size={16} /> : <Eye size={16} />}
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
                )}

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
                    {modoModulos
                      ? "Módulos definem o que a pessoa enxerga no menu; status pausado bloqueia a entrada sem apagar histórico."
                      : "Cargo e módulos definem o que a pessoa enxerga; status pausado bloqueia a entrada sem apagar histórico."}
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
                    {salvando ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : modoCriacao ? (
                      <UserPlus size={16} />
                    ) : modoModulos ? (
                      <LayoutGrid size={16} />
                    ) : (
                      <KeyRound size={16} />
                    )}
                    {modoCriacao ? "Criar acesso" : modoModulos ? "Salvar módulos" : "Salvar senha"}
                  </button>
                </div>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={usuarioParaExcluir !== null} onOpenChange={(open) => { if (!open && !excluindo) setUsuarioParaExcluir(null); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
          <DialogPrimitive.Content className="fixed inset-x-3 bottom-3 z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.1rem] border border-border bg-card text-left shadow-[0_18px_48px_rgba(14,15,19,.24)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(26rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2">
            <div className="flex items-start gap-3 px-5 py-5">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-sm font-bold text-foreground">
                  Excluir {usuarioParaExcluir?.nome}?
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  O login é removido do Supabase Auth imediatamente. Se este usuário nunca autorizou nada, comentou ou
                  ficou responsável por um cliente/pedido/conversa, o registro some por completo. Se tiver histórico
                  vinculado, o CRM anonimiza em vez de apagar — para não perder quem resolveu o quê.
                </DialogPrimitive.Description>
              </div>
            </div>
            <div className="flex gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setUsuarioParaExcluir(null)}
                disabled={excluindo}
                className="h-11 flex-1 rounded-[0.75rem] border border-border text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarExclusao}
                disabled={excluindo}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[0.75rem] bg-destructive text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {excluindo ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                Excluir
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={usuarioParaRenomear !== null} onOpenChange={(open) => { if (!open && !renomeando) setUsuarioParaRenomear(null); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
          <DialogPrimitive.Content className="fixed inset-x-3 bottom-3 z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.1rem] border border-border bg-card text-left shadow-[0_18px_48px_rgba(14,15,19,.24)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(24rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2">
            <form onSubmit={confirmarRenomeacao}>
              <div className="flex items-start gap-3 px-5 py-5">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Pencil size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title className="text-sm font-bold text-foreground">
                    Renomear usuário
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {usuarioParaRenomear?.email}
                  </DialogPrimitive.Description>
                  <input
                    autoFocus
                    value={novoNome}
                    onChange={(event) => setNovoNome(event.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                    className="mt-3 h-11 w-full rounded-[0.75rem] border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)]"
                  />
                </div>
              </div>
              <div className="flex gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={() => setUsuarioParaRenomear(null)}
                  disabled={renomeando}
                  className="h-11 flex-1 rounded-[0.75rem] border border-border text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={renomeando || novoNome.trim().length < 2}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[0.75rem] text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: "var(--selecionado)" }}
                >
                  {renomeando ? <Loader2 className="animate-spin" size={14} /> : <Pencil size={14} />}
                  Salvar
                </button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
