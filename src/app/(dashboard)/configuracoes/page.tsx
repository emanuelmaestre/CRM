"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronDown, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { SectionCard as Card } from "@/shared/design-system/primitives/SectionCard";
import { fadeUp, stagger } from "@/shared/design-system/motion-variants";
import { getIcon } from "@/shared/config/icon-registry";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { MLConnectSection } from "./MLConnectSection";
import settingsConfig from "@/config/settings.json";
import permissionsConfig from "@/config/permissions.json";
import {
  actionAtualizarContaCanal,
  actionAtualizarUsuario,
  actionCriarContaCanal,
  actionListarConfiguracaoCanais,
  actionListarProdutosConfiguracao,
  actionListarUsuarios,
  actionObterResumoConfiguracoes,
  actionRemoverContaCanal,
  actionSalvarMapeamentoCanal,
} from "./actions";
import type { Perfil } from "@/shared/lib/auth/authorization";
import { toast } from "sonner";
import { getBrandConfig } from "@/shared/config/brands";

const PendingIcon = getIcon(settingsConfig.status.pendingIcon);
const ExternalIcon = getIcon(settingsConfig.openAction.icon);

type UsuarioResumo = Awaited<ReturnType<typeof actionListarUsuarios>>[number];
type CanalConfiguracao = Awaited<ReturnType<typeof actionListarConfiguracaoCanais>>[number];
type ProdutoConfiguracao = Awaited<ReturnType<typeof actionListarProdutosConfiguracao>>[number];
type ResumoConfiguracoes = Awaited<ReturnType<typeof actionObterResumoConfiguracoes>>;

/** Título que separa os blocos temáticos da página, no lugar da pilha de cards. */
function SectionHeading({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <motion.h2
      variants={fadeUp}
      className="flex items-center gap-2 pt-1 text-[15px] font-bold text-foreground"
    >
      <Icon size={16} strokeWidth={1.75} className="text-muted-foreground" />
      {title}
    </motion.h2>
  );
}

/** Campo rotulado: os formulários usavam placeholder como único rótulo. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, accent }: { label: string; value?: string; accent?: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value && (
        <span className="text-sm font-medium text-foreground" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
      connected ? "bg-[#1F8A4C]/10 text-[#1F8A4C]" : "bg-muted text-muted-foreground"
    }`}>
      {connected
        ? <><span className="w-1.5 h-1.5 rounded-full bg-[#1F8A4C] inline-block" /> {settingsConfig.status.active}</>
        : <><PendingIcon size={11} strokeWidth={2} /> {settingsConfig.status.pending}</>
      }
    </span>
  );
}

function formatarData(value: string | null) {
  if (!value) return "Nunca verificado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function CanalStatusBadge({ status, pronto }: { status: CanalConfiguracao["status"]; pronto: boolean }) {
  const tone = pronto || status === "conectado"
    ? "bg-[#1F8A4C]/10 text-[#1F8A4C]"
    : status === "degradado"
      ? "bg-[#B57A00]/10 text-[#B57A00]"
      : status === "desconectado"
        ? "bg-[#C21820]/10 text-[#C21820]"
        : "bg-muted text-muted-foreground";
  const label = pronto ? "Pronto" : status === "pendente" ? "Pendente" : status;
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${tone}`}>{label}</span>;
}

function ContaCanalEditForm({ item, onCancel, onSaved }: {
  item: CanalConfiguracao; onCancel: () => void; onSaved: () => void;
}) {
  const [nome, setNome] = useState(item.contaNome ?? "");
  const [externalAccountId, setExternalAccountId] = useState(item.externalAccountId ?? "");
  const [pending, startTransition] = useTransition();

  function salvar() {
    startTransition(async () => {
      try {
        await actionAtualizarContaCanal({
          channelAccountId: item.channelAccountId,
          nome,
          externalAccountId: externalAccountId || undefined,
        });
        toast.success("Conta de canal atualizada.");
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a conta.");
      }
    });
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-card p-3">
      <input
        value={nome}
        onChange={(event) => setNome(event.target.value)}
        placeholder="Nome interno da conta"
        className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
      />
      <input
        value={externalAccountId}
        onChange={(event) => setExternalAccountId(event.target.value)}
        placeholder={settingsConfig.channelForms.externalId.placeholder}
        className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-muted-foreground disabled:opacity-50">
          <X size={12} /> Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={pending || nome.trim().length < 2 || (item.canal !== "whatsapp" && !externalAccountId.trim())}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--gradient-signature)" }}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

function ContaCanalCard({ item, onChanged }: { item: CanalConfiguracao; onChanged: () => void }) {
  const [editando, setEditando] = useState(false);
  const [removendo, startRemoverTransition] = useTransition();
  const brandColor = getBrandConfig(item.brand)?.color ?? "var(--muted-foreground)";

  function remover() {
    const channelAccountId = item.channelAccountId;
    if (!channelAccountId) return;
    if (!window.confirm(`Remover a conta "${item.contaNome}" de ${item.canalLabel}? Essa ação não pode ser desfeita.`)) return;
    startRemoverTransition(async () => {
      try {
        await actionRemoverContaCanal({ channelAccountId });
        toast.success("Conta de canal removida.");
        onChanged();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível remover a conta.");
      }
    });
  }

  return (
    <article className="min-w-0 rounded-xl border border-border bg-background/60 p-4">
      <div className="flex items-start gap-3">
        <ChannelLogo canal={item.canalLabel} size="sm" variant="logo" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm text-foreground">{item.canalLabel}</p>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{
              background: `color-mix(in srgb, ${brandColor} 10%, transparent)`,
              color: brandColor,
            }}>
              {item.brandLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.contaNome ?? "Conta não cadastrada"} · {item.skusMapeados} SKU{item.skusMapeados === 1 ? "" : "s"} · {formatarData(item.ultimaVerificacao)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {settingsConfig.channelForms.externalId.label}: {item.externalAccountId ?? settingsConfig.channelForms.externalId.missing}
            {item.externalAccountIdSource && (
              <span className="ml-1 opacity-70">
                ({settingsConfig.channelForms.externalId[item.externalAccountIdSource]})
              </span>
            )}
          </p>
          {item.externalAccountIdMismatch && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#B57A00]/10 px-2.5 py-2 text-xs font-medium text-[#B57A00]">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              {settingsConfig.channelForms.externalId.mismatch}
            </p>
          )}
          {item.envAusentes.length > 0 && (
            <p className="mt-2 line-clamp-2 text-xs text-[#B57A00]">
              Variáveis ausentes: {item.envAusentes.join(", ")}
            </p>
          )}
          {item.ultimoErro && <p className="mt-2 line-clamp-2 text-xs text-destructive">{item.ultimoErro}</p>}
          {!item.pronto && item.envAusentes.length === 0 && item.skusMapeados === 0 && item.canal !== "whatsapp" && (
            <p className="mt-2 text-xs text-muted-foreground">Mapeie SKUs para liberar sincronização de estoque.</p>
          )}
          {editando && item.channelAccountId && (
            <ContaCanalEditForm
              item={item}
              onCancel={() => setEditando(false)}
              onSaved={() => { setEditando(false); onChanged(); }}
            />
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <CanalStatusBadge status={item.status} pronto={item.pronto} />
          {item.channelAccountId && !editando && (
            <div className="flex gap-1">
              <button
                type="button"
                aria-label={`Editar conta de ${item.canalLabel}`}
                onClick={() => setEditando(true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                aria-label={`Remover conta de ${item.canalLabel}`}
                onClick={remover}
                disabled={removendo}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function CanaisOperacionais({ items, loading, onChanged }: { items: CanalConfiguracao[]; loading: boolean; onChanged: () => void }) {
  return (
    <div>
      {loading && <p className="text-sm text-muted-foreground">{settingsConfig.loading}</p>}
      {!loading && items.length === 0 && (
        <EmptyState illustration="generic" title="Sem marcas ativas" description="Cadastre marcas para configurar canais." />
      )}
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {items.map((item) => <ContaCanalCard key={item.id} item={item} onChanged={onChanged} />)}
      </div>
    </div>
  );
}

function CadastrarContaCanalForm({ canais, onDone }: { canais: CanalConfiguracao[]; onDone: () => void }) {
  const marcas = useMemo(() => Array.from(new Map(canais.map((item) => [item.brandId, item])).values()), [canais]);
  const [brandId, setBrandId] = useState(marcas[0]?.brandId ?? "");
  const [tipo, setTipo] = useState("whatsapp");
  const [nome, setNome] = useState("");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedBrandId = brandId || marcas[0]?.brandId || "";
  const marketplace = tipo !== "whatsapp";

  function idConhecido(nextBrandId: string, nextTipo: string) {
    return canais.find((item) => item.brandId === nextBrandId && item.canal === nextTipo)?.externalAccountId ?? "";
  }

  function submit() {
    startTransition(async () => {
      try {
        await actionCriarContaCanal({ brandId: selectedBrandId, tipo, nome, externalAccountId: externalAccountId || undefined });
        setNome("");
        setExternalAccountId("");
        toast.success("Conta de canal cadastrada.");
        onDone();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar a conta.");
      }
    });
  }

  const inputClass = "min-h-11 rounded-xl border border-border bg-background px-3 text-sm";

  return (
    <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]">
      <Field label="Marca">
        <select
          value={selectedBrandId}
          onChange={(event) => {
            const nextBrandId = event.target.value;
            setBrandId(nextBrandId);
            setExternalAccountId(idConhecido(nextBrandId, tipo));
          }}
          className={inputClass}
        >
          <option value="">Selecione</option>
          {marcas.map((marca) => <option key={marca.brandId} value={marca.brandId}>{marca.brandLabel}</option>)}
        </select>
      </Field>
      <Field label="Canal">
        <select
          value={tipo}
          onChange={(event) => {
            const nextTipo = event.target.value;
            setTipo(nextTipo);
            setExternalAccountId(idConhecido(selectedBrandId, nextTipo));
          }}
          className={inputClass}
        >
          {["whatsapp", "mercadolivre", "shopee", "tiktokshop", "olist"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="Nome interno">
        <input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: KARZI principal" className={inputClass} />
      </Field>
      <Field label={`${settingsConfig.channelForms.externalId.label}${marketplace ? " *" : ""}`}>
        <input
          value={externalAccountId}
          onChange={(event) => setExternalAccountId(event.target.value)}
          placeholder={marketplace
            ? settingsConfig.channelForms.externalId.required
            : settingsConfig.channelForms.externalId.placeholder}
          className={inputClass}
        />
      </Field>
      <button type="button" disabled={pending || !selectedBrandId || !nome.trim() || (marketplace && !externalAccountId.trim())} onClick={submit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--gradient-signature)" }}>
        <Plus size={15} /> Cadastrar
      </button>
    </div>
  );
}

function MapearSkuCanalForm({
  canais,
  produtos,
  onDone,
}: {
  canais: CanalConfiguracao[];
  produtos: ProdutoConfiguracao[];
  onDone: () => void;
}) {
  const contas = useMemo(() => canais.filter((item) => item.channelAccountId), [canais]);
  const [channelAccountId, setChannelAccountId] = useState(contas[0]?.channelAccountId ?? "");
  const [produtoId, setProdutoId] = useState("");
  const [externalListingId, setExternalListingId] = useState("");
  const [externalSkuId, setExternalSkuId] = useState("");
  const [externalWarehouseId, setExternalWarehouseId] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedChannelAccountId = channelAccountId || contas[0]?.channelAccountId || "";
  const conta = contas.find((item) => item.channelAccountId === selectedChannelAccountId);
  const produtosDaMarca = conta ? produtos.filter((item) => item.brandId === conta.brandId) : [];

  function submit() {
    startTransition(async () => {
      try {
        await actionSalvarMapeamentoCanal({
          produtoId,
          channelAccountId: selectedChannelAccountId,
          externalListingId,
          externalSkuId: externalSkuId || undefined,
          externalWarehouseId: externalWarehouseId || undefined,
        });
        setExternalListingId("");
        setExternalSkuId("");
        setExternalWarehouseId("");
        toast.success("Mapeamento salvo.");
        onDone();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível salvar o mapeamento.");
      }
    });
  }

  if (contas.length === 0) {
    return <p className="text-sm text-muted-foreground">Cadastre uma conta de canal antes de mapear SKUs.</p>;
  }

  const inputClass = "min-h-11 rounded-xl border border-border bg-background px-3 text-sm";

  return (
    <div className="grid items-end gap-3 lg:grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_auto]">
      <Field label="Conta de canal">
        <select value={selectedChannelAccountId} onChange={(event) => { setChannelAccountId(event.target.value); setProdutoId(""); }} className={inputClass}>
          <option value="">Selecione</option>
          {contas.map((item) => (
            <option key={item.channelAccountId} value={item.channelAccountId ?? ""}>{item.canalLabel} — {item.brandLabel}</option>
          ))}
        </select>
      </Field>
      <Field label="Produto da mesma marca">
        <select value={produtoId} onChange={(event) => setProdutoId(event.target.value)} className={inputClass}>
          <option value="">Selecione</option>
          {produtosDaMarca.map((item) => <option key={item.id} value={item.id}>{item.sku} — {item.nome}</option>)}
        </select>
      </Field>
      <Field label="ID do anúncio">
        <input value={externalListingId} onChange={(event) => setExternalListingId(event.target.value)} placeholder="Listing" className={inputClass} />
      </Field>
      <Field label="SKU externo">
        <input value={externalSkuId} onChange={(event) => setExternalSkuId(event.target.value)} placeholder="Opcional" className={inputClass} />
      </Field>
      <Field label="Warehouse">
        <input value={externalWarehouseId} onChange={(event) => setExternalWarehouseId(event.target.value)} placeholder="Opcional" className={inputClass} />
      </Field>
      <button type="button" disabled={pending || !produtoId || !selectedChannelAccountId || !externalListingId.trim()} onClick={submit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--gradient-signature)" }}>
        <Link2 size={15} /> Mapear
      </button>
    </div>
  );
}

function IntegrationRow({ name, description, href, color, connected = false }: {
  name: string; description?: string; href?: string; color?: string; connected?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ x: 1 }}
      className="flex justify-between items-center py-3 border-b border-border last:border-0"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{name}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="ml-3 flex-shrink-0 flex items-center gap-2">
        <StatusBadge connected={connected} />
        {href && (
          <motion.a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold text-white shadow-sm"
            style={{ background: color ?? "var(--foreground)" }}
          >
            {settingsConfig.openAction.label} <ExternalIcon size={10} strokeWidth={2.5} />
          </motion.a>
        )}
      </div>
    </motion.div>
  );
}

export default function ConfiguracoesPage() {
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [canais, setCanais] = useState<CanalConfiguracao[]>([]);
  const [produtos, setProdutos] = useState<ProdutoConfiguracao[]>([]);
  const [resumo, setResumo] = useState<ResumoConfiguracoes | null>(null);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [carregandoCanais, setCarregandoCanais] = useState(true);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  const [alterandoUsuario, setAlterandoUsuario] = useState<string | null>(null);
  const [formulariosAbertos, setFormulariosAbertos] = useState(false);

  async function recarregarCanaisEProdutos() {
    setCarregandoCanais(true);
    setCarregandoProdutos(true);
    try {
      const [canaisAtualizados, produtosAtualizados] = await Promise.all([
        actionListarConfiguracaoCanais(),
        actionListarProdutosConfiguracao(),
      ]);
      setCanais(canaisAtualizados);
      setProdutos(produtosAtualizados);
    } catch {
      toast.error("Não foi possível atualizar canais e produtos.");
    } finally {
      setCarregandoCanais(false);
      setCarregandoProdutos(false);
    }
  }

  useEffect(() => {
    Promise.all([
      actionListarUsuarios(),
      actionListarConfiguracaoCanais(),
      actionListarProdutosConfiguracao(),
      actionObterResumoConfiguracoes(),
    ])
      .then(([usuariosIniciais, canaisIniciais, produtosIniciais, resumoInicial]) => {
        setUsuarios(usuariosIniciais);
        setCanais(canaisIniciais);
        setProdutos(produtosIniciais);
        setResumo(resumoInicial);
      })
      .catch(() => toast.error("Não foi possível carregar as configurações."))
      .finally(() => {
        setCarregandoUsuarios(false);
        setCarregandoCanais(false);
        setCarregandoProdutos(false);
      });
  }, []);

  async function alterarUsuario(usuario: UsuarioResumo, perfil: Perfil, ativo: boolean) {
    setAlterandoUsuario(usuario.id);
    try {
      const atualizado = await actionAtualizarUsuario({ userId: usuario.id, perfil, ativo });
      setUsuarios((atuais) => atuais.map((item) => item.id === atualizado.id ? atualizado : item));
      toast.success(settingsConfig.users.messages.updateSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : settingsConfig.users.messages.updateError);
    } finally {
      setAlterandoUsuario(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={settingsConfig.header.title}
        description={settingsConfig.header.description}
      />

      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">

        <SectionHeading title={settingsConfig.sections.acesso.title} icon={getIcon(settingsConfig.sections.acesso.icon)} />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Card title={settingsConfig.organization.title} icon={getIcon(settingsConfig.organization.icon)}>
            <Row label={settingsConfig.organization.labels.name} value={resumo?.organizationName ?? settingsConfig.loading} />
            <Row label={settingsConfig.organization.labels.activeBrands} value={resumo?.activeBrands.join(", ") ?? settingsConfig.loading} />
            <Row
              label={settingsConfig.organization.labels.configuredAccounts}
              value={String(canais.filter((item) => item.channelAccountId).length)}
            />
            <Row
              label={settingsConfig.organization.labels.connectedAccounts}
              value={String(canais.filter((item) => item.status === "conectado").length)}
            />
          </Card>

          <Card title={settingsConfig.users.title} icon={getIcon(settingsConfig.users.icon)}>
            {carregandoUsuarios && <p className="text-sm text-muted-foreground">{settingsConfig.users.loading}</p>}
            {!carregandoUsuarios && usuarios.length === 0 && (
              <p className="text-sm text-muted-foreground">{settingsConfig.users.empty}</p>
            )}
            <div className="divide-y divide-border">
              {usuarios.map((usuario) => (
                <div key={usuario.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{usuario.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
                  </div>
                  <select
                    aria-label={`Perfil de ${usuario.nome}`}
                    value={usuario.perfil}
                    disabled={alterandoUsuario === usuario.id}
                    onChange={(event) => alterarUsuario(usuario, event.target.value as Perfil, usuario.ativo)}
                    className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                  >
                    {Object.entries(permissionsConfig.profiles).map(([perfil, dados]) => (
                      <option key={perfil} value={perfil}>{dados.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={alterandoUsuario === usuario.id}
                    onClick={() => alterarUsuario(usuario, usuario.perfil, !usuario.ativo)}
                    className={`h-9 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${
                      usuario.ativo
                        ? "bg-[#1F8A4C]/10 text-[#1F8A4C]"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {usuario.ativo ? settingsConfig.users.deactivate : settingsConfig.users.activate}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <SectionHeading title={settingsConfig.sections.canais.title} icon={getIcon(settingsConfig.sections.canais.icon)} />

        <Card title="Canais por marca" icon={getIcon("Wifi")}>
          <CanaisOperacionais items={canais} loading={carregandoCanais} onChanged={recarregarCanaisEProdutos} />
        </Card>

        <Card title={settingsConfig.mercadoLivre.title} icon={getIcon("ShoppingBag")}>
          <Suspense fallback={<p className="text-sm text-muted-foreground py-2">{settingsConfig.loading}</p>}>
            <MLConnectSection />
          </Suspense>
        </Card>

        {/* Formularios de manutencao: ficam recolhidos porque sao usados de vez
            em quando, e abertos ocupavam duas telas de altura por nada. */}
        <Card
          title={settingsConfig.channelForms.showLabel}
          icon={Link2}
          actions={
            <button
              type="button"
              onClick={() => setFormulariosAbertos((v) => !v)}
              aria-expanded={formulariosAbertos}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {formulariosAbertos ? settingsConfig.channelForms.hideLabel : settingsConfig.channelForms.showLabel}
              <ChevronDown
                size={14}
                className={`transition-transform ${formulariosAbertos ? "rotate-180" : ""}`}
              />
            </button>
          }
        >
          {!formulariosAbertos ? (
            <p className="text-sm text-muted-foreground">{settingsConfig.channelForms.hint}</p>
          ) : carregandoCanais || carregandoProdutos ? (
            <p className="text-sm text-muted-foreground">{settingsConfig.loading}</p>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Cadastrar conta de canal
                </h3>
                <CadastrarContaCanalForm canais={canais} onDone={recarregarCanaisEProdutos} />
              </div>
              <div className="border-t border-border pt-5">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Mapear SKU × anúncio
                </h3>
                <MapearSkuCanalForm canais={canais} produtos={produtos} onDone={recarregarCanaisEProdutos} />
              </div>
            </div>
          )}
        </Card>

        <Card title={settingsConfig.integrations.title} icon={getIcon(settingsConfig.integrations.icon)}>
          {settingsConfig.integrations.items
            .filter((i) => i.name !== settingsConfig.mercadoLivre.title)
            .map((integration) => {
              const [source, value] = integration.statusSource.split(":");
              const connected = source === "channel"
                ? canais.some((item) => item.canal === value && item.status === "conectado")
                : value === "inngest" ? resumo?.inngestConfigured === true : resumo?.openAiConfigured === true;
              return <IntegrationRow key={integration.name} {...integration} connected={connected} />;
            })}
        </Card>

        <SectionHeading title={settingsConfig.sections.administracao.title} icon={getIcon(settingsConfig.sections.administracao.icon)} />

        {/* Tres cards identicos (auditoria, LGPD, consumo) viraram uma lista. */}
        <Card
          title={settingsConfig.adminAreas.title}
          description={settingsConfig.adminAreas.description}
          icon={getIcon(settingsConfig.adminAreas.icon)}
        >
          <div className="divide-y divide-border">
            {settingsConfig.adminAreas.items.map((area) => {
              const AreaIcon = getIcon(area.icon);
              return (
                <div key={area.href} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <AreaIcon size={15} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{area.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{area.description}</p>
                    </div>
                  </div>
                  <Link
                    href={area.href}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg px-4 text-xs font-semibold text-white sm:self-center"
                    style={{ background: "var(--gradient-signature)" }}
                  >
                    {area.action}
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title={settingsConfig.system.title} icon={getIcon(settingsConfig.system.icon)}>
          <Row label={settingsConfig.system.labels.version} value={settingsConfig.system.version} />
          <Row label={settingsConfig.system.labels.environment} value={resumo?.environment ?? settingsConfig.loading} />
          <Row
            label={settingsConfig.system.labels.externalSends}
            value={resumo?.externalSendsEnabled
              ? settingsConfig.system.labels.enabled
              : settingsConfig.system.labels.disabled}
            accent={resumo?.externalSendsEnabled ? "#1F8A4C" : "#B57A00"}
          />
        </Card>

        <Card
          title={settingsConfig.healthLink.title}
          description={settingsConfig.healthLink.description}
          icon={getIcon(settingsConfig.healthLink.icon)}
        >
          <Link
            href={settingsConfig.healthLink.href}
            className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-xs font-semibold text-white"
            style={{ background: "var(--gradient-signature)" }}
          >
            {settingsConfig.healthLink.action}
          </Link>
        </Card>

      </motion.div>
    </div>
  );
}
