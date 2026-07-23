import { describe, expect, it } from "vitest";
import appConfig from "@/config/app.json";
import brandsConfig from "@/config/brands.json";
import channelsConfig from "@/config/channels.json";
import dashboardConfig from "@/config/dashboard.json";
import navigationConfig from "@/config/navigation.json";
import pagesConfig from "@/config/pages.json";
import reportsConfig from "@/config/reports.json";
import settingsConfig from "@/config/settings.json";
import saudeConfig from "@/config/saude.json";
import wizardsConfig from "@/config/wizards.json";
import { iconRegistry } from "@/shared/config/icon-registry";

describe("contratos JSON da interface", () => {
  it("mantém rotas e identificadores de navegação únicos", () => {
    const ids = navigationConfig.items.map((item) => item.id);
    const hrefs = navigationConfig.items.map((item) => item.href);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(navigationConfig.items.filter((item) => item.mobile)).toHaveLength(5);
  });

  it("registra todos os ícones referenciados pelos arquivos JSON", () => {
    const icons = [
      ...navigationConfig.items.map((item) => item.icon),
      ...Object.values(navigationConfig.utilities).map((item) => item.icon),
      dashboardConfig.revenue.icon,
      dashboardConfig.connectCta.icon,
      dashboardConfig.recentOrders.icon,
      dashboardConfig.channels.connectedIcon,
      dashboardConfig.channels.disconnectedIcon,
      ...dashboardConfig.kpis.map((item) => item.icon),
      settingsConfig.organization.icon,
      settingsConfig.users.icon,
      settingsConfig.integrations.icon,
      settingsConfig.system.icon,
      settingsConfig.audit.icon,
      settingsConfig.status.pendingIcon,
      settingsConfig.openAction.icon,
      ...settingsConfig.groups.flatMap((group) => [group.icon, ...group.cards.map((card) => card.icon)]),
      ...Object.values(saudeConfig.sections).map((section) => section.icon),
      ...pagesConfig.inbox.tabs.map((tab) => tab.icon),
    ];

    for (const icon of icons) expect(iconRegistry).toHaveProperty(icon);
  });

  it("mantém marcas e assistentes consistentes", () => {
    expect(appConfig.brandOrder).toEqual(Object.keys(brandsConfig));
    for (const wizard of Object.values(wizardsConfig)) {
      expect(wizard.steps).toHaveLength(3);
      expect(wizard.sections).toHaveLength(wizard.steps.length);
      expect(wizard.cancelHref).toMatch(/^\//);
    }
  });

  it("mantém funil, tarefas e agenda na operação comercial", () => {
    expect(pagesConfig.vendas.tabs.map((tab) => tab.href)).toEqual(["/vendas", "/vendas/pedidos", "/tarefas", "/agenda"]);
    expect(pagesConfig.auditoria.origins).toHaveProperty("sistema");
  });

  it("mantém o conector Mercado Livre dirigido pela configuração JSON", () => {
    expect(settingsConfig.mercadoLivre.brands.map((brand) => brand.slug)).toEqual(
      appConfig.brandOrder,
    );
    expect(settingsConfig.mercadoLivre.feedback.success).toContain("{brand}");
    expect(Object.keys(settingsConfig.mercadoLivre.feedback.errors)).toContain("token_exchange_failed");
  });

  it("mantém conteúdo e plataformas do Inbox íntegros no JSON", () => {
    const questions = pagesConfig.inbox.questions;

    expect(questions.platformOrder).toEqual(Object.keys(questions.platforms));
    expect(pagesConfig.inbox.tabs.map((tab) => tab.id)).toEqual(["conversas", "perguntas"]);
    for (const platform of Object.values(questions.platforms)) {
      expect(platform.charLimit).toBeGreaterThan(0);
      expect(platform.quickReplies.length).toBeGreaterThan(0);
      expect(platform.logo).toMatch(/^\/logos\/.+\.svg$/);
    }
  });

  it("preserva marcadores dos textos interpolados", () => {
    expect(reportsConfig.aiBudgetAlert).toContain("{alert}");
    expect(reportsConfig.aiBudgetAlert).toContain("{budget}");
    expect(saudeConfig.labels.verifiedAt).toContain("{date}");
    expect(saudeConfig.labels.attempt).toContain("{attempt}");
    expect(pagesConfig.inbox.conversation.statusUpdated).toContain("{status}");
    expect(pagesConfig.tarefas.labels.statusAria).toContain("{title}");
  });

  it("mantém páginas institucionais e estados do sistema configurados", () => {
    expect(pagesConfig.terms.sections).toHaveLength(6);
    expect(pagesConfig.system.loading.ariaLabel).not.toHaveLength(0);
    expect(pagesConfig.system.dashboardError.title).not.toHaveLength(0);
    expect(appConfig.logo.src).toMatch(/^\/logos\/.+\.svg$/);
  });

  it("mantém o catálogo de canais dirigido pelo JSON", () => {
    expect(channelsConfig.aliases["mercado livre"]).toBe("mercadolivre");
    expect(channelsConfig.items).toHaveProperty("tiktokshop");
    for (const channel of Object.values(channelsConfig.items)) {
      expect(channel.label).not.toHaveLength(0);
      expect(channel.iconAspect).toBeGreaterThan(0);
      if (channel.logo) expect(channel.logo).toMatch(/^\/logos\/.+\.svg$/);
    }
  });
});
