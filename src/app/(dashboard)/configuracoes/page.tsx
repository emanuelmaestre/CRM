"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Link2, Plus } from "lucide-react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { getIcon } from "@/shared/config/icon-registry";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { MLConnectSection } from "./MLConnectSection";
import settingsConfig from "@/config/settings.json";
import permissionsConfig from "@/config/permissions.json";
import {
  actionAtualizarUsuario,
  actionCriarContaCanal,
  actionListarConfiguracaoCanais,
  actionListarProdutosConfiguracao,
  actionListarUsuarios,
  actionSalvarMapeamentoCanal,
} from "./actions";
import type { Perfil } from "@/shared/lib/auth/authorization";
import { toast } from "sonner";

const PendingIcon = getIcon(settingsConfig.status.pendingIcon);
const ExternalIcon = getIcon(settingsConfig.openAction.icon);

type UsuarioResumo = Awaited<ReturnType<typeof actionListarUsuarios>>[number];
type CanalConfiguracao = Awaited<ReturnType<typeof actionListarConfiguracaoCanais>>[number];
type ProdutoConfiguracao = Awaited<ReturnType<typeof actionListarProdutosConfiguracao>>[number];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 5, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: [0, 0, 0.2, 1] as [number,number,number,number] } },
};

function Card({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -1, boxShadow: "0 6px 24px rgba(14,15,19,.09)" }}
      transition={{ duration: 0.18 }}
      className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]"
    >
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
          <Icon size={14} strokeWidth={1.75} />
        </div>
        <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
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

function CanaisOperacionais({ items, loading }: { items: CanalConfiguracao[]; loading: boolean }) {
  return (
    <div>
      {loading && <p className="text-sm text-muted-foreground">{settingsConfig.loading}</p>}
      {!loading && items.length === 0 && (
        <EmptyState illustration="generic" title="Sem marcas ativas" description="Cadastre marcas para configurar canais." />
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-border bg-background/60 p-4">
            <div className="flex items-start gap-3">
              <ChannelLogo canal={item.canalLabel} size="sm" variant="logo" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm text-foreground">{item.canalLabel}</p>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{
                    background: item.brand === "karzi" ? "#E3131B18" : "#9B30D918",
                    color: item.brand === "karzi" ? "#E3131B" : "#9B30D9",
                  }}>
                    {item.brandLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.contaNome ?? "Conta nao cadastrada"} · {item.skusMapeados} SKU{item.skusMapeados === 1 ? "" : "s"} · {formatarData(item.ultimaVerificacao)}
                </p>
                {item.envAusentes.length > 0 && (
                  <p className="mt-2 line-clamp-2 text-xs text-[#B57A00]">
                    Variaveis ausentes: {item.envAusentes.join(", ")}
                  </p>
                )}
                {item.ultimoErro && <p className="mt-2 line-clamp-2 text-xs text-destructive">{item.ultimoErro}</p>}
                {!item.pronto && item.envAusentes.length === 0 && item.skusMapeados === 0 && item.canal !== "whatsapp" && (
                  <p className="mt-2 text-xs text-muted-foreground">Mapeie SKUs para liberar sincronizacao de estoque.</p>
                )}
              </div>
              <CanalStatusBadge status={item.status} pronto={item.pronto} />
            </div>
          </article>
        ))}
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

  function submit() {
    startTransition(async () => {
      try {
        await actionCriarContaCanal({ brandId: selectedBrandId, tipo, nome, externalAccountId: externalAccountId || undefined });
        setNome("");
        setExternalAccountId("");
        toast.success("Conta de canal cadastrada.");
        onDone();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Nao foi possivel cadastrar a conta.");
      }
    });
  }

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]">
      <select value={selectedBrandId} onChange={(event) => setBrandId(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
        <option value="">Marca</option>
        {marcas.map((marca) => <option key={marca.brandId} value={marca.brandId}>{marca.brandLabel}</option>)}
      </select>
      <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
        {["whatsapp", "mercadolivre", "shopee", "tiktokshop", "olist"].map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Nome interno da conta" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
      <input value={externalAccountId} onChange={(event) => setExternalAccountId(event.target.value)} placeholder="ID externo, seller ou shop" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
      <button type="button" disabled={pending || !selectedBrandId || !nome.trim()} onClick={submit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--gradient-signature)" }}>
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
        toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar o mapeamento.");
      }
    });
  }

  if (contas.length === 0) {
    return <p className="text-sm text-muted-foreground">Cadastre uma conta de canal antes de mapear SKUs.</p>;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_auto]">
      <select value={selectedChannelAccountId} onChange={(event) => { setChannelAccountId(event.target.value); setProdutoId(""); }} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
        <option value="">Conta de canal</option>
        {contas.map((item) => (
          <option key={item.channelAccountId} value={item.channelAccountId ?? ""}>{item.canalLabel} - {item.brandLabel}</option>
        ))}
      </select>
      <select value={produtoId} onChange={(event) => setProdutoId(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
        <option value="">Produto da mesma marca</option>
        {produtosDaMarca.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.nome}</option>)}
      </select>
      <input value={externalListingId} onChange={(event) => setExternalListingId(event.target.value)} placeholder="ID anuncio/listing" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
      <input value={externalSkuId} onChange={(event) => setExternalSkuId(event.target.value)} placeholder="SKU/modelo externo" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
      <input value={externalWarehouseId} onChange={(event) => setExternalWarehouseId(event.target.value)} placeholder="Warehouse" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
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
        {href ? (
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
        ) : (
          <StatusBadge connected={connected} />
        )}
      </div>
    </motion.div>
  );
}

export default function ConfiguracoesPage() {
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [canais, setCanais] = useState<CanalConfiguracao[]>([]);
  const [produtos, setProdutos] = useState<ProdutoConfiguracao[]>([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [carregandoCanais, setCarregandoCanais] = useState(true);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  const [alterandoUsuario, setAlterandoUsuario] = useState<string | null>(null);

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
      toast.error("Nao foi possivel atualizar canais e produtos.");
    } finally {
      setCarregandoCanais(false);
      setCarregandoProdutos(false);
    }
  }

  useEffect(() => {
    actionListarUsuarios()
      .then(setUsuarios)
      .catch(() => toast.error(settingsConfig.users.messages.loadError))
      .finally(() => setCarregandoUsuarios(false));

    Promise.all([
      actionListarConfiguracaoCanais(),
      actionListarProdutosConfiguracao(),
    ])
      .then(([canaisIniciais, produtosIniciais]) => {
        setCanais(canaisIniciais);
        setProdutos(produtosIniciais);
      })
      .catch(() => toast.error("Nao foi possivel carregar canais e produtos."))
      .finally(() => {
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

        {/* Linha 1 */}
        <div className="grid md:grid-cols-2 gap-5">
          <Card title={settingsConfig.organization.title} icon={getIcon(settingsConfig.organization.icon)}>
            {settingsConfig.organization.rows.map((row) => <Row key={row.label} {...row} />)}
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

        {/* Canais */}
        <Card title="Canais por marca" icon={getIcon("Wifi")}>
          <CanaisOperacionais items={canais} loading={carregandoCanais} />
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="Cadastrar conta de canal" icon={Plus}>
            {carregandoCanais ? (
              <p className="text-sm text-muted-foreground">{settingsConfig.loading}</p>
            ) : (
              <CadastrarContaCanalForm canais={canais} onDone={recarregarCanaisEProdutos} />
            )}
          </Card>

          <Card title="Mapear SKU x anuncio" icon={Link2}>
            {carregandoCanais || carregandoProdutos ? (
              <p className="text-sm text-muted-foreground">{settingsConfig.loading}</p>
            ) : (
              <MapearSkuCanalForm canais={canais} produtos={produtos} onDone={recarregarCanaisEProdutos} />
            )}
          </Card>
        </div>

        {/* Mercado Livre OAuth */}
        <Card title={settingsConfig.mercadoLivre.title} icon={getIcon("ShoppingBag")}>
          <Suspense fallback={<p className="text-sm text-muted-foreground py-2">{settingsConfig.loading}</p>}>
            <MLConnectSection />
          </Suspense>
        </Card>

        {/* Integrações */}
        <Card title={settingsConfig.integrations.title} icon={getIcon(settingsConfig.integrations.icon)}>
          {settingsConfig.integrations.items
            .filter((i) => i.name !== settingsConfig.mercadoLivre.title)
            .map((integration) => (
              <IntegrationRow key={integration.name} {...integration} />
            ))}
        </Card>

        {/* Sistema */}
        <Card title={settingsConfig.system.title} icon={getIcon(settingsConfig.system.icon)}>
          {settingsConfig.system.rows.map((row) => <Row key={row.label} {...row} />)}
        </Card>

        <Card title={settingsConfig.audit.title} icon={getIcon(settingsConfig.audit.icon)}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{settingsConfig.audit.description}</p>
            <Link
              href={settingsConfig.audit.href}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
              style={{ background: "var(--gradient-signature)" }}
            >
              {settingsConfig.audit.action}
            </Link>
          </div>
        </Card>

        <Card title="Solicitacoes LGPD" icon={getIcon("ShieldCheck")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Gerencie exportacao, rejeicao e anonimizacao com trilha de auditoria.
            </p>
            <Link
              href="/admin/lgpd"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
              style={{ background: "var(--gradient-signature)" }}
            >
              Abrir LGPD
            </Link>
          </div>
        </Card>

        {settingsConfig.groups.map((group) => {
          const GroupIcon = getIcon(group.icon);
          return (
            <div key={group.title}>
              <motion.h2 variants={fadeUp} className="flex items-center gap-2 text-[15px] font-bold text-foreground mb-4">
                <GroupIcon size={16} strokeWidth={1.75} className="text-muted-foreground" />
                {group.title}
              </motion.h2>
              <div className="grid md:grid-cols-2 gap-5">
                {group.cards.map((card) => (
                  <Card key={card.title} title={card.title} icon={getIcon(card.icon)}>
                    <EmptyState
                      illustration={card.illustration as React.ComponentProps<typeof EmptyState>["illustration"]}
                      title={card.emptyTitle}
                      description={card.description}
                    />
                  </Card>
                ))}
              </div>
            </div>
          );
        })}

      </motion.div>
    </div>
  );
}
