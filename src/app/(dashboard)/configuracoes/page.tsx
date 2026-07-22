"use client";

import { Suspense } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { getIcon } from "@/shared/config/icon-registry";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { MLConnectSection } from "./MLConnectSection";
import settingsConfig from "@/config/settings.json";
import dashboardConfig from "@/config/dashboard.json";

const ConnectedIcon = getIcon(dashboardConfig.channels.connectedIcon);
const DisconnectedIcon = getIcon(dashboardConfig.channels.disconnectedIcon);

const PendingIcon = getIcon(settingsConfig.status.pendingIcon);
const ExternalIcon = getIcon(settingsConfig.openAction.icon);

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
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground">{settingsConfig.users.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{settingsConfig.users.role}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1F8A4C]/10 text-[#1F8A4C]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1F8A4C] inline-block" />
                {settingsConfig.status.active}
              </span>
            </div>
          </Card>
        </div>

        {/* Canais */}
        <Card title={dashboardConfig.channels.title} icon={getIcon(dashboardConfig.channels.connectedIcon)}>
          {dashboardConfig.channels.items.map((c) => (
            <div key={c.name} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
              <ChannelLogo canal={c.name} size="sm" variant="logo" />
              <span className="text-sm text-foreground flex-1">{c.name}</span>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                c.connected
                  ? "bg-[#1F8A4C]/10 text-[#1F8A4C]"
                  : "bg-muted text-muted-foreground"
              }`}>
                {c.connected ? dashboardConfig.channels.connectedLabel : dashboardConfig.channels.disconnectedLabel}
              </span>
            </div>
          ))}
        </Card>

        {/* Mercado Livre OAuth */}
        <Card title="Mercado Livre" icon={getIcon("ShoppingBag")}>
          <Suspense fallback={<p className="text-sm text-muted-foreground py-2">Carregando…</p>}>
            <MLConnectSection />
          </Suspense>
        </Card>

        {/* Integrações */}
        <Card title={settingsConfig.integrations.title} icon={getIcon(settingsConfig.integrations.icon)}>
          {settingsConfig.integrations.items
            .filter((i) => i.name !== "Mercado Livre")
            .map((integration) => (
              <IntegrationRow key={integration.name} {...integration} />
            ))}
        </Card>

        {/* Sistema */}
        <Card title={settingsConfig.system.title} icon={getIcon(settingsConfig.system.icon)}>
          {settingsConfig.system.rows.map((row) => <Row key={row.label} {...row} />)}
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
