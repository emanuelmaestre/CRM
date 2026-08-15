"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
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
import { AutomacoesSection } from "./AutomacoesSection";
import { SincronizacaoSection } from "./SincronizacaoSection";
import settingsConfig from "@/config/settings.json";
import permissionsConfig from "@/config/permissions.json";
import {
  actionAtualizarUsuario,
  actionListarConfiguracaoCanais,
  actionListarUsuarios,
  actionObterResumoConfiguracoes,
} from "./actions";
import type { Perfil } from "@/shared/lib/auth/authorization";
import { toast } from "sonner";

const PendingIcon = getIcon(settingsConfig.status.pendingIcon);
const ExternalIcon = getIcon(settingsConfig.openAction.icon);

type UsuarioResumo = Awaited<ReturnType<typeof actionListarUsuarios>>[number];
type CanalConfiguracao = Awaited<ReturnType<typeof actionListarConfiguracaoCanais>>[number];
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

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
      connected ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
    }`}>
      {connected
        ? <><span className="w-1.5 h-1.5 rounded-full bg-success inline-block" /> {settingsConfig.status.active}</>
        : <><PendingIcon size={11} strokeWidth={2} /> {settingsConfig.status.pending}</>
      }
    </span>
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
  const [resumo, setResumo] = useState<ResumoConfiguracoes | null>(null);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [carregandoCanais, setCarregandoCanais] = useState(true);
  const [alterandoUsuario, setAlterandoUsuario] = useState<string | null>(null);

  const recarregarCanais = useCallback(async () => {
    setCarregandoCanais(true);
    try {
      setCanais(await actionListarConfiguracaoCanais());
    } catch {
      toast.error("Não foi possível atualizar os canais.");
    } finally {
      setCarregandoCanais(false);
    }
  }, []);

  const mlStatus = useMercadoLivreStatus(recarregarCanais);

  useEffect(() => {
    Promise.all([
      actionListarUsuarios(),
      actionListarConfiguracaoCanais(),
      actionObterResumoConfiguracoes(),
    ])
      .then(([usuariosIniciais, canaisIniciais, resumoInicial]) => {
        setUsuarios(usuariosIniciais);
        setCanais(canaisIniciais);
        setResumo(resumoInicial);
      })
      .catch(() => toast.error("Não foi possível carregar as configurações."))
      .finally(() => {
        setCarregandoUsuarios(false);
        setCarregandoCanais(false);
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
              <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
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
                        ? "bg-success/10 text-success"
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
            onChanged={recarregarCanais}
            mlStatus={mlStatus}
          />
        </Card>

        <Card
          title="Central de sincronização"
          description="Catálogo e pedidos sob demanda, por conta — roda em segundo plano."
          icon={getIcon("Repeat")}
        >
          {carregandoCanais ? (
            <p className="text-sm text-muted-foreground">{settingsConfig.loading}</p>
          ) : (
            <SincronizacaoSection canais={canais} />
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

        <Card
          title={settingsConfig.automacoes.title}
          description={settingsConfig.automacoes.description}
          icon={getIcon(settingsConfig.automacoes.icon)}
        >
          <AutomacoesSection />
        </Card>

      </motion.div>
    </div>
  );
}
