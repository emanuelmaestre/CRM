import { describe, expect, it } from "vitest";
import {
  buildTenantConnectionString,
  getDatabaseClientOptions,
  resolveDatabaseConnectionString,
} from "@/shared/lib/db";

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

  it("limita conexões por instância serverless", () => {
    expect(getDatabaseClientOptions()).toMatchObject({
      max: 1,
      idle_timeout: 10,
      connect_timeout: 10,
      max_lifetime: 60,
      prepare: false,
    });
  });

  it("usa o pooler regional quando a URL aponta para o host direto do Supabase", () => {
    const directUrl =
      "postgresql://postgres:secret@db.hnyswnefymnszuqzrewm.supabase.co:5432/postgres?sslmode=require";
    const result = new URL(resolveDatabaseConnectionString(directUrl));

    expect(result.hostname).toBe("aws-1-sa-east-1.pooler.supabase.com");
    expect(result.port).toBe("5432");
    expect(result.username).toBe("postgres.hnyswnefymnszuqzrewm");
    expect(result.password).toBe("secret");
    expect(result.searchParams.get("sslmode")).toBe("require");
  });

  it("mantém URLs que não pertencem ao host direto configurado", () => {
    const localUrl = "postgresql://user:secret@localhost:5432/crm";

    expect(resolveDatabaseConnectionString(localUrl)).toBe(localUrl);
  });
});
