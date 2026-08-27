import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { camposAnonimizadosCliente } from "@/modules/clientes/domain/anonimizacao";
import { cliente } from "@/shared/lib/db/schema/clientes";

/* Campos de `cliente` que NÃO são dado pessoal e por isso continuam de pé
   depois da anonimização. Todo o resto tem que ser zerado — e é isso que o
   teste abaixo cobra, para que um campo novo de PII não entre no schema sem
   entrar junto na anonimização. Foi assim que endereço e geolocalização
   ficaram para trás no job A22 por meses. */
const NAO_PESSOAIS = new Set([
  "id", "orgId", "deletedAt", "createdAt", "updatedAt", "nome",
]);

describe("anonimização de cliente", () => {
  it("zera todo campo pessoal que existe no schema, sem depender de memória", () => {
    const anonimizado = camposAnonimizadosCliente("Cliente anonimizado", new Date());
    const pessoais = Object.keys(getTableColumns(cliente)).filter((c) => !NAO_PESSOAIS.has(c));

    for (const campo of pessoais) {
      expect(anonimizado, `campo pessoal "${campo}" ficou de fora da anonimização`)
        .toHaveProperty(campo, null);
    }
  });

  it("mantém o nome como marcador, não como null, para a linha seguir legível", () => {
    expect(camposAnonimizadosCliente("[Anonimizado abc]", new Date()).nome).toBe("[Anonimizado abc]");
  });

  it("carimba a data de atualização", () => {
    const quando = new Date("2026-08-27T12:00:00Z");
    expect(camposAnonimizadosCliente("x", quando).updatedAt).toBe(quando);
  });
});
