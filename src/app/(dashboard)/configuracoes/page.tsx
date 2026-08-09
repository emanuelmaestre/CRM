"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Link2, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { SectionCard as Card } from "@/shared/design-system/primitives/SectionCard";
import { fadeUp, stagger } from "@/shared/design-system/motion-variants";
import { getIcon } from "@/shared/config/icon-registry";
import { MLConnectionStrip } from "./MLConnectionStrip";
import { ChannelConnectionStrip } from "./ChannelConnectionStrip";
import { MLOAuthFeedback } from "./MLOAuthFeedback";
import { CanaisPorMarca } from "./CanaisPorMarca";
import { useMercadoLivreStatus } from "./useMercadoLivreStatus";
import { MLCatalogMappingSection } from "./MLCatalogMappingSection";
import { MLHistoricalImportSection } from "./MLHistoricalImportSection";
import settingsConfig from "@/config/settings.json";
import permissionsConfig from "@/config/permissions.json";
import {
  actionAtualizarUsuario,
  actionCriarContaCanal,
  actionListarConfiguracaoCanais,
  actionListarProdutosConfiguracao,
  actionListarUsuarios,
  actionObterResumoConfiguracoes,
  actionSalvarMapeamentoCanal,
} from "./actions";
import type { Perfil } from "@/shared/lib/auth/authorization";
import { toast } from "sonner";

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

function CadastrarContaCanalForm({ canais, onDone }: { canais: CanalConfiguracao[]; onDone: () => void }) {
  const marcas = useMemo(() => Array.from(new Map(canais.map((item) => [item.brandId, item])).values()), [canais]);
  const [brandId, setBrandId] = useState(marcas[0]?.brandId ?? "");
  const [tipo, setTipo] = useState("mercadolivre");
  const [nome, setNome] = useState("");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedBrandId = brandId || marcas[0]?.brandId || "";
  const marketplace = true;

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
          {["mercadolivre", "shopee", "tiktokshop", "olist"].map((item) => <option key={item} value={item}>{item}</option>)}
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

  const recarregarCanaisEProdutos = useCallback(async () => {
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
  }, []);

  const mlStatus = useMercadoLivreStatus(recarregarCanaisEProdutos);

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

        <Card title={settingsConfig.sections.acesso.title} icon={getIcon(settingsConfig.sections.acesso.icon)}>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <p className="text-sm font-semibold text-foreground">
              {resumo?.organizationName ?? settingsConfig.loading}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {resumo?.activeBrands.length ?? 0} marca{resumo?.activeBrands.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full bg-[#1F8A4C]/10 px-2.5 py-1 text-xs font-medium text-[#1F8A4C]">
                {canais.filter((item) => item.status === "conectado").length}/{canais.length} canais conectados
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-3">
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
          </div>
        </Card>

        <SectionHeading title={settingsConfig.sections.canais.title} icon={getIcon(settingsConfig.sections.canais.icon)} />

        <Card title="Canais por marca" icon={getIcon("Wifi")}>
          {/* Faixas-resumo por marketplace acima do grid: status num relance, ação no card. */}
          <div className="mb-4 divide-y divide-border rounded-xl border border-border bg-background/60 [&>*]:px-4 [&>*]:py-3">
            <div>
              <Suspense fallback={null}>
                <MLOAuthFeedback onConectado={mlStatus.atualizar} />
              </Suspense>
              <MLConnectionStrip status={mlStatus} />
            </div>
            <div>
              <ChannelConnectionStrip canal="shopee" items={canais.filter((item) => item.canal === "shopee")} />
            </div>
            <div>
              <ChannelConnectionStrip canal="tiktokshop" items={canais.filter((item) => item.canal === "tiktokshop")} />
            </div>
          </div>
          <CanaisPorMarca
            items={canais}
            loading={carregandoCanais}
            onChanged={recarregarCanaisEProdutos}
            mlStatus={mlStatus}
          />
        </Card>

        <Card title={settingsConfig.mercadoLivre.title} icon={getIcon("ShoppingBag")}>
          <MLCatalogMappingSection produtos={produtos} onMapped={recarregarCanaisEProdutos} />
          <MLHistoricalImportSection />
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
