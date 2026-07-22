import { describe, expect, it } from "vitest";
import appConfig from "@/config/app.json";
import brandsConfig from "@/config/brands.json";
import dashboardConfig from "@/config/dashboard.json";
import navigationConfig from "@/config/navigation.json";
import settingsConfig from "@/config/settings.json";
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

  it("mantém funil, tarefas e agenda na operação comercial", async () => {
    const pagesConfig = await import("@/config/pages.json");
    expect(pagesConfig.default.vendas.tabs.map((tab) => tab.href)).toEqual(["/vendas", "/tarefas", "/agenda"]);
    expect(pagesConfig.default.auditoria.origins).toHaveProperty("sistema");
  });

  it("mantém o conector Mercado Livre dirigido pela configuração JSON", () => {
    expect(settingsConfig.mercadoLivre.brands.map((brand) => brand.slug)).toEqual(
      appConfig.brandOrder,
    );
    expect(settingsConfig.mercadoLivre.feedback.success).toContain("{brand}");
    expect(Object.keys(settingsConfig.mercadoLivre.feedback.errors)).toContain("token_exchange_failed");
  });
});
