import { expect, test } from "@playwright/test";

const rotas = [
  "/clientes", "/estoque", "/estoque/alertas",
  "/vendas", "/vendas/pedidos", "/auditoria", "/importacao", "/avaliacoes", "/metricas",
  "/configuracoes", "/admin/saude", "/admin/lgpd", "/admin/consumo-ia",
];

const viewports = [
  { width: 320, height: 568 }, { width: 360, height: 640 },
  { width: 375, height: 667 }, { width: 390, height: 844 },
  { width: 393, height: 852 }, { width: 412, height: 915 },
  { width: 414, height: 896 }, { width: 430, height: 932 },
  { width: 600, height: 960 }, { width: 720, height: 540 },
  { width: 768, height: 1024 }, { width: 800, height: 1280 },
  { width: 820, height: 1180 }, { width: 960, height: 600 },
  { width: 1024, height: 768 }, { width: 1280, height: 720 },
  { width: 1366, height: 768 }, { width: 1440, height: 900 },
  { width: 1536, height: 864 }, { width: 1600, height: 900 },
  { width: 1920, height: 1080 }, { width: 2560, height: 1440 },
];

test.describe("auditoria responsiva completa", () => {
  test.skip(({ viewport }) => viewport?.width !== 360, "A matriz controla a viewport internamente.");

  for (const rota of rotas) {
    test(`${rota} permanece íntegra entre 320px e 2560px`, async ({ page }) => {
      test.setTimeout(180_000);

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto(rota, { waitUntil: "domcontentloaded" });
        await expect(page).not.toHaveURL(/\/auth\/login/);
        await expect(page.locator("main")).toBeVisible();

        const resultado = await page.evaluate(() => {
          const root = document.documentElement;
          const tolerancia = 1;
          const foraDaViewport = [...document.body.querySelectorAll<HTMLElement>("*")]
            .filter((elemento) => {
              const estilo = getComputedStyle(elemento);
              if (estilo.display === "none" || estilo.visibility === "hidden") return false;
              const caixa = elemento.getBoundingClientRect();
              if (caixa.width === 0 || caixa.height === 0) return false;
              const possuiScrollLocal = /(auto|scroll)/.test(estilo.overflowX);
              return !possuiScrollLocal && (caixa.left < -tolerancia || caixa.right > innerWidth + tolerancia);
            })
            .slice(0, 10)
            .map((elemento) => ({ tag: elemento.tagName, classe: elemento.className, texto: elemento.innerText?.slice(0, 60) }));

          return {
            overflowGlobal: root.scrollWidth > innerWidth + tolerancia,
            foraDaViewport,
          };
        });

        expect(resultado, `${rota} em ${viewport.width}x${viewport.height}`).toEqual({
          overflowGlobal: false,
          foraDaViewport: [],
        });
      }
    });
  }
});
