import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
    expect(navigationConfig.items.filter((item) => item.mobilePriority)).toHaveLength(6);
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
    expect(pagesConfig.vendas.tabs.map((tab) => tab.href)).toEqual(["/vendas", "/vendas/pedidos"]);
    expect(pagesConfig.tarefas.tabs.map((tab) => tab.href)).toEqual(["/tarefas", "/agenda"]);
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
      // A logo não vive aqui: quem resolve é channels.json, via ChannelLogo.
      expect(platform).not.toHaveProperty("logo");
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
      expect(channel.iconScale).toBeGreaterThan(0);
      if (channel.logo) {
        // Só a variante icone-only: apontar para o wordmark faz o nome da
        // plataforma aparecer escrito nas abas de canal.
        expect(channel.logo).toMatch(/^\/logos\/[a-z]+-icon\.svg$/);
        expect(existsSync(join(process.cwd(), "public", channel.logo))).toBe(true);
      }
    }
  });

  it("mantém os ícones de canal com a proporção declarada no JSON", () => {
    // Guarda contra o bug real: mercadolivre.svg tinha width/height de proporção
    // 24.27 e viewBox de 3.66, então o navegador encolhia o desenho e a logo
    // aparecia minúscula. Aqui o viewBox do arquivo tem de bater com iconAspect.
    for (const [nome, channel] of Object.entries(channelsConfig.items)) {
      if (!channel.logo) continue;
      const svg = readFileSync(join(process.cwd(), "public", channel.logo), "utf8");
      const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
      expect(viewBox, `${nome} sem viewBox`).toBeDefined();

      const [, , largura, altura] = viewBox!.split(/[\s,]+/).map(Number);
      expect(largura / altura).toBeCloseTo(channel.iconAspect, 2);

      const w = Number(svg.match(/\swidth="([\d.]+)"/)?.[1]);
      const h = Number(svg.match(/\sheight="([\d.]+)"/)?.[1]);
      expect(w / h, `${nome}: width/height divergem do viewBox`).toBeCloseTo(largura / altura, 2);
    }
  });
});
