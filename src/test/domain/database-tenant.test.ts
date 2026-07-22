import { describe, expect, it } from "vitest";
import { buildTenantConnectionString } from "@/shared/lib/db";

describe("Conexão tenant do Postgres", () => {
  it("configura a org e o nome da aplicação na sessão", () => {
    const orgId = "123e4567-e89b-42d3-a456-426614174000";
    const result = new URL(buildTenantConnectionString("postgresql://user:secret@localhost:5432/crm", orgId));

    expect(result.searchParams.get("application_name")).toBe("crm-leo");
    expect(result.searchParams.get("options")).toContain(`app.current_org_id=${orgId}`);
  });

  it("rejeita organização inválida", () => {
    expect(() => buildTenantConnectionString("postgresql://localhost/crm", "org-invalida"))
      .toThrow("DEFAULT_ORG_ID deve ser um UUID válido");
  });
});
