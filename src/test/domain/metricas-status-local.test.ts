import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => fs.readFileSync(path.join(process.cwd(), arquivo), "utf8");

describe("Métricas — status de anúncio vem da coleta local", () => {
  const dashboard = ler("src/modules/metricas/application/dashboard.service.ts");
  const coleta = ler("src/modules/jobs/A5-reconciliacao-saldo.ts");
  const schema = ler("src/shared/lib/db/schema/estoque.ts");

  it("não chama o provider do Mercado Livre ao montar os filtros", () => {
    expect(dashboard).not.toContain("criarMLProvider");
    expect(dashboard).not.toContain("consultarStatusAnuncios");
  });

  it("lê o snapshot persistido no vínculo do anúncio", () => {
    expect(dashboard).toContain("produtoCanal.mlStatusAnuncio");
    expect(dashboard).toContain("produtoCanal.mlSubStatus");
    expect(dashboard).toContain("eq(produtoCanal.ativo, true)");
  });

  it("persiste na A5 a resposta que já foi coletada em lote", () => {
    expect(coleta).toContain("mlStatusAnuncio: grupo.status");
    expect(coleta).toContain("mlSubStatus: grupo.subStatus");
    expect(coleta).toContain("mlStatusVerificadoEm: statusVerificadoEm");
    expect(schema).toContain('mlStatusAnuncio: text("ml_status_anuncio")');
  });
});
