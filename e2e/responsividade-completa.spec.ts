import { expect, test, type Page } from "@playwright/test";

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
  // Celulares em paisagem, incluindo modelos cuja largura cruza 768px.
  { width: 568, height: 320 }, { width: 640, height: 360 },
  { width: 844, height: 390 }, { width: 932, height: 430 },
  { width: 600, height: 960 }, { width: 720, height: 540 },
  { width: 768, height: 1024 }, { width: 800, height: 1280 },
  { width: 820, height: 1180 }, { width: 960, height: 600 },
  // Tablets em paisagem usam exatamente a composição de desktop.
  { width: 1024, height: 768 }, { width: 1180, height: 820 },
  { width: 1280, height: 800 }, { width: 1280, height: 720 },
  { width: 1366, height: 768 }, { width: 1440, height: 900 },
  { width: 1536, height: 864 }, { width: 1600, height: 900 },
  { width: 1920, height: 1080 }, { width: 2560, height: 1440 },
];

async function medir(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const tolerancia = 1;
    const foraDaViewport = [...document.body.querySelectorAll<HTMLElement>("*")]
      .filter((elemento) => {
        const estilo = getComputedStyle(elemento);
        if (estilo.display === "none" || estilo.visibility === "hidden") return false;
        const caixa = elemento.getBoundingClientRect();
        if (caixa.width === 0 || caixa.height === 0) return false;
        // O contêiner de rolagem quase nunca é o próprio elemento: o padrão
        // do projeto é uma tabela larga (`min-w-[780px]`) dentro de um
        // `div.overflow-x-auto`. Olhando só o próprio elemento, a auditoria
        // acusava essa tabela em 768px — conteúdo que rola dentro da própria
        // caixa, que é o comportamento desejado, não vazamento de layout.
        let ancestral: HTMLElement | null = elemento;
        while (ancestral && ancestral !== document.body) {
          if (/(auto|scroll)/.test(getComputedStyle(ancestral).overflowX)) return false;
          ancestral = ancestral.parentElement;
        }
        return caixa.left < -tolerancia || caixa.right > innerWidth + tolerancia;
      })
      .slice(0, 10)
      .map((elemento) => ({ tag: elemento.tagName, classe: elemento.className, texto: elemento.innerText?.slice(0, 60) }));

    return {
      overflowGlobal: root.scrollWidth > innerWidth + tolerancia,
      foraDaViewport,
    };
  });
}

test.describe("auditoria responsiva completa", () => {
  test.skip(({ viewport }) => viewport?.width !== 360, "A matriz controla a viewport internamente.");

  for (const rota of rotas) {
    test(`${rota} permanece íntegra entre 320px e 2560px`, async ({ page }) => {
      test.setTimeout(180_000);

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        try {
          await page.goto(rota, { waitUntil: "domcontentloaded" });
        } catch (erro) {
          // Rota que redireciona no servidor (/vendas/pedidos -> /vendas)
          // aborta a navegação original: o Chromium cancela a primeira
          // resposta e segue para o destino. Com `domcontentloaded` isso
          // chega aqui como net::ERR_ABORTED, e a auditoria falhava por um
          // redirecionamento funcionando como deveria. O destino carrega logo
          // em seguida — é ele que interessa medir.
          if (!String(erro).includes("ERR_ABORTED")) throw erro;
          await page.waitForLoadState("domcontentloaded");
        }
        await expect(page).not.toHaveURL(/\/auth\/login/);
        await expect(page.locator("main")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        /* A medida precisa ser de um estado ESTÁVEL. Cartão entrando com
           animação mede maior por alguns quadros: /admin/lgpd acusava os
           cartões em left 19 / right 329 numa leitura e nada na seguinte, com
           o documento sem rolagem nenhuma (scrollWidth 320) — ou seja, nada
           vazava de fato. Repete a aferição até parar de acusar. Vazamento
           real persiste, e aí o teste falha do mesmo jeito. */
        let resultado = await medir(page);
        for (let tentativa = 0; tentativa < 6 && resultado.foraDaViewport.length > 0; tentativa++) {
          await page.waitForTimeout(250);
          resultado = await medir(page);
        }

        expect(resultado, `${rota} em ${viewport.width}x${viewport.height}`).toEqual({
          overflowGlobal: false,
          foraDaViewport: [],
        });
      }
    });
  }
});
