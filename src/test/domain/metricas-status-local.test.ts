import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => fs.readFileSync(path.join(process.cwd(), arquivo), "utf8");

describe("Métricas — status de anúncio vem da coleta local", () => {
  const dashboard = ler("src/modules/metricas/application/dashboard.service.ts");
  const mosaico = ler("src/app/(dashboard)/metricas/mosaico.tsx");
  const snapshot = ler("src/modules/jobs/A30-snapshot-metricas.ts");
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

  it("não mantém placares fictícios no mosaico", () => {
    expect(mosaico).not.toMatch(/FICTICI|VARIACAO_FICTICIA/);
    expect(mosaico).not.toContain("dados={[9, 8, 8, 7, 7, 6");
    expect(mosaico).toContain("calcularVantagemPercentualDaLider");
    expect(mosaico).toContain("Vantagem sobre a 2ª colocada");
  });

  it("devolve todos os itens válidos e versiona o escopo do snapshot", () => {
    expect(dashboard).toContain("giroBaixoTotal: giroBaixoCompleto.length");
    expect(dashboard).toContain("paradosTotal: paradosCompletos.length");
    expect(dashboard).toContain("reposicaoTotal: reposicaoCompleta.length");
    expect(dashboard).not.toContain("TAMANHO_LISTA");
    expect(dashboard).not.toMatch(/\.slice\(0,\s*6\)/);
    expect(snapshot).toContain("ESCOPO_SNAPSHOT_METRICAS");
    expect(snapshot).toContain("dashboard.paradosTotal");
  });
});
