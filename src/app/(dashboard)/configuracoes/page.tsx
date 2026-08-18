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
import { BackupSection } from "./BackupSection";
import { SincronizacaoSection } from "./SincronizacaoSection";
import { UsuariosSection } from "./UsuariosSection";
import settingsConfig from "@/config/settings.json";
import {
  actionListarConfiguracaoCanais,
  actionListarUsuarios,
  actionObterResumoConfiguracoes,
} from "./actions";
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
            whileHover={{ scale: 1.02 }}
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

  const ordenarUsuarios = useCallback((items: UsuarioResumo[]) =>
    [...items].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })),
  []);

  return (
    <div>
      <PageHeader
        title={settingsConfig.header.title}
        description={settingsConfig.header.description}
      />

      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">

        <Card
          title="Usuários"
          description="Acessos, perfis e senhas temporárias da organização"
          icon={getIcon("UsersRound")}
        >
          <UsuariosSection
            usuarios={usuarios}
            loading={carregandoUsuarios}
            organizationName={resumo?.organizationName ?? null}
            marcasAtivas={resumo?.activeBrands.length ?? 0}
            canaisConectados={canais.filter((item) => item.status === "conectado").length}
            canaisTotal={canais.length}
            onUsuarioCriado={(usuario) => setUsuarios((atuais) => ordenarUsuarios([...atuais, usuario]))}
            onUsuarioAtualizado={(usuario) =>
              setUsuarios((atuais) => ordenarUsuarios(atuais.map((item) => item.id === usuario.id ? usuario : item)))
            }
            onUsuarioExcluido={(userId) =>
              setUsuarios((atuais) => atuais.filter((item) => item.id !== userId))
            }
          />
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

        <Card
          title="Backup"
          description="Exportação sob demanda dos dados da organização, em JSON e CSV"
          icon={getIcon("DatabaseBackup")}
        >
          <BackupSection />
        </Card>

      </motion.div>
    </div>
  );
}
