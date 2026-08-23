import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import appConfig from "@/config/app.json";
import brandsConfig from "@/config/brands.json";
import channelsConfig from "@/config/channels.json";
import dashboardConfig from "@/config/dashboard.json";
import navigationConfig from "@/config/navigation.json";
import pagesConfig from "@/config/pages.json";
import metricasConfig from "@/config/metricas.json";
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
      ...Object.values(dashboardConfig.cards).map((card) => card.icon),
      settingsConfig.integrations.icon,
      settingsConfig.system.icon,
      ...Object.values(settingsConfig.sections).map((section) => section.icon),
      settingsConfig.status.pendingIcon,
      settingsConfig.openAction.icon,
      ...Object.values(saudeConfig.sections).map((section) => section.icon),
    ];

    for (const icon of icons) expect(iconRegistry).toHaveProperty(icon);
  });

  it("mantém marcas e assistentes consistentes", () => {
    expect(appConfig.brandOrder).toEqual(Object.keys(brandsConfig));
    expect(appConfig.brandOrder).toEqual(["armarinhos_lima", "karzi", "wuwu"]);
    for (const brand of Object.values(brandsConfig)) {
      expect(brand.logo).toMatch(/^\/logos\/.+\.svg$/);
      expect(brand.logoSize.width).toBeGreaterThan(0);
      expect(brand.logoSize.height).toBeGreaterThan(0);
      expect(existsSync(join(process.cwd(), "public", brand.logo))).toBe(true);

      const svg = readFileSync(join(process.cwd(), "public", brand.logo), "utf8");
      const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
      expect(viewBox).toBeDefined();
      const [, , width, height] = viewBox!.split(/[\s,]+/).map(Number);
      expect(brand.logoSize.width / brand.logoSize.height).toBeCloseTo(width / height, 2);
    }
    for (const wizard of Object.values(wizardsConfig)) {
      expect(wizard.steps).toHaveLength(3);
      expect(wizard.sections).toHaveLength(wizard.steps.length);
      expect(wizard.cancelHref).toMatch(/^\//);
    }
  });

  it("mantém os critérios de comparação de Métricas alinhados ao componente", () => {
    // A comparação lado a lado troca de critério por essas chaves; um label novo
    // com chave errada renderiza um botão que não ordena nada.
    expect(metricasConfig.comparacaoCard.criterios.map((item) => item.chave)).toEqual([
      "score", "faturamento", "pedidos", "ticketMedio", "notaMedia", "cancelamento", "recorrencia",
    ]);
    // Cada taxa da reputação precisa do próximo passo escrito; sem ele, a tela
    // diz que a taxa estourou e não diz o que fazer a respeito.
    expect(Object.keys(metricasConfig.reputacaoCard.acoes)).toEqual([
      "reclamacao", "cancelamento", "atrasoEnvio",
    ]);
    expect(Object.keys(metricasConfig.acoesCard.statusSugestao)).toEqual([
      "sugerida", "aprovada", "rejeitada", "disparada",
    ]);
  });

  it("mantém a auditoria na operação comercial", () => {
    expect(pagesConfig.auditoria.origins).toHaveProperty("sistema");
  });

  it("mantém o conector Mercado Livre dirigido pela configuração JSON", () => {
    expect(settingsConfig.mercadoLivre.brands.map((brand) => brand.slug)).toEqual(
      appConfig.brandOrder,
    );
    expect(settingsConfig.mercadoLivre.feedback.success).toContain("{brand}");
    expect(Object.keys(settingsConfig.mercadoLivre.feedback.errors)).toContain("token_exchange_failed");
    expect(settingsConfig.mercadoLivre.catalog.summary).toContain("{shown}");
    expect(settingsConfig.mercadoLivre.catalog.summary).toContain("{total}");
  });

  it("não mantém estados operacionais fixos na tela de configurações", () => {
    expect(settingsConfig.system).not.toHaveProperty("rows");
    expect(settingsConfig).not.toHaveProperty("groups");
    expect(settingsConfig.integrations.items.every((item) => item.statusSource.includes(":"))).toBe(true);
    expect(settingsConfig.channelForms.externalId.required).not.toHaveLength(0);
  });

  it("preserva marcadores dos textos interpolados", () => {
    expect(saudeConfig.labels.verifiedAt).toContain("{date}");
    expect(saudeConfig.labels.attempt).toContain("{attempt}");
    expect(saudeConfig.automacoes.map((item) => item.id)).toEqual(
      expect.arrayContaining(["A23", "A24", "A25", "A26"]),
    );
  });

  it("mantém páginas institucionais e estados do sistema configurados", () => {
    expect(pagesConfig.terms.sections).toHaveLength(6);
    expect(pagesConfig.system.loading.ariaLabel).not.toHaveLength(0);
    expect(pagesConfig.system.dashboardError.title).not.toHaveLength(0);
    expect(appConfig.logo.alt).toContain("ARMARINHOS LIMA");
  });

  it("mantém a massa sintética cobrindo todas as marcas configuradas", () => {
    const catalog = JSON.parse(
      readFileSync(join(process.cwd(), "seeds", "synthetic.json"), "utf8"),
    ) as {
      brands: { key: string }[];
      channelAccounts: { brand: string }[];
      products: { brand: string }[];
      orders: { brand: string }[];
    };
    const configured = new Set(appConfig.brandOrder);

    expect(new Set(catalog.brands.map((brand) => brand.key))).toEqual(configured);
    for (const collection of [catalog.channelAccounts, catalog.products, catalog.orders]) {
      expect(new Set(collection.map((item) => item.brand))).toEqual(configured);
    }
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
