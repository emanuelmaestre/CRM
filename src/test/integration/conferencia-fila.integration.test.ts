import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand } from "@/shared/lib/db/schema";
import { resumirPedidosIgnorados } from "@/modules/vendas/application/pedidos-ignorados.service";

/* O defeito que este teste tranca, e que chegou em produção em 30/08/2026:
   dentro de um fragmento `sql` cru, o parâmetro vai direto para o driver, que
   só aceita string ou Buffer. Passar um `Date` ali derruba a consulta inteira
   com "The string argument must be of type string" — e como esta consulta
   viaja junto da listagem de pedidos, a tela de Vendas parou de carregar
   ("Erro ao carregar pedidos") minutos depois do deploy.

   Nenhum teste de componente pegava isso: a tela roda com a action mockada, e
   o erro só existe entre o drizzle e o Postgres. Daí ser um teste integrado —
   e de leitura pura, sem criar nem apagar nada. */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste integrado da conferência.");
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID é obrigatória para o teste integrado da conferência.");

describe("resumo da fila para a conferência com o canal", { timeout: 30_000 }, () => {
  it("aceita o recorte por data — é o caminho que quebrou a tela", async () => {
    const resumo = await resumirPedidosIgnorados({ orgId }, {
      inicio: new Date("2026-08-01T00:00:00-03:00"),
      fim: new Date("2026-08-31T23:59:59-03:00"),
    });

    expect(Number.isFinite(resumo.valor)).toBe(true);
    expect(Number.isInteger(resumo.quantidade)).toBe(true);
    expect(resumo.quantidade).toBeGreaterThanOrEqual(0);
  });

  it("aceita marca e canal junto do período", async () => {
    // Qualquer marca da org serve: o que se prova aqui é que o filtro monta
    // e roda, não o número que ele devolve.
    const [marca] = await db.select({ id: brand.id }).from(brand).where(eq(brand.orgId, orgId)).limit(1);

    const resumo = await resumirPedidosIgnorados({ orgId }, {
      brandIds: marca ? [marca.id] : undefined,
      canais: ["mercadolivre"],
      inicio: new Date("2026-06-01T00:00:00-03:00"),
      fim: new Date("2026-08-31T23:59:59-03:00"),
    });

    expect(resumo.quantidade).toBeGreaterThanOrEqual(0);
    expect(resumo.valor).toBeGreaterThanOrEqual(0);
  });

  it("sem recorte nenhum devolve a fila inteira", async () => {
    const resumo = await resumirPedidosIgnorados({ orgId }, {});
    expect(resumo.quantidade).toBeGreaterThanOrEqual(0);
  });
});
