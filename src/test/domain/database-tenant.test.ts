import { describe, expect, it } from "vitest";
import {
  buildTenantConnectionString,
  getDatabaseClientOptions,
  resolveDatabaseConnectionString,
} from "@/shared/lib/db";

describe("Conexão tenant do Postgres", () => {
  it("configura o nome da aplicação na sessão", () => {
    const orgId = "123e4567-e89b-42d3-a456-426614174000";
    const result = new URL(buildTenantConnectionString("postgresql://user:secret@localhost:5432/crm", orgId));

    expect(result.searchParams.get("application_name")).toBe("crm-leo");
    // app.current_org_id não vai mais na connection string — era inerte
    // para a conexão da app (role "postgres" tem rolbypassrls=true, ver
    // src/shared/lib/db/index.ts).
    expect(result.searchParams.has("options")).toBe(false);
  });

  it("rejeita organização inválida", () => {
    expect(() => buildTenantConnectionString("postgresql://localhost/crm", "org-invalida"))
      .toThrow("DEFAULT_ORG_ID deve ser o UUID de uma org existente");
  });

  // O placeholder do .env.example não corresponde a nenhuma org: se passasse na
  // validação, o app subiria e só falharia mais tarde, como "acesso negado".
  it("rejeita o placeholder do .env.example", () => {
    expect(() => buildTenantConnectionString("postgresql://localhost/crm", "00000000-0000-0000-0000-000000000000"))
      .toThrow("DEFAULT_ORG_ID deve ser o UUID de uma org existente");
  });

  it("permite paralelismo via pooler em transaction mode", () => {
    expect(getDatabaseClientOptions()).toMatchObject({
      max: 10,
      idle_timeout: 10,
      connect_timeout: 10,
      max_lifetime: 60 * 30,
      prepare: false,
    });
  });

  it("usa o pooler regional em transaction mode quando a URL aponta para o host direto do Supabase", () => {
    const directUrl =
      "postgresql://postgres:secret@db.hnyswnefymnszuqzrewm.supabase.co:5432/postgres?sslmode=require";
    const result = new URL(resolveDatabaseConnectionString(directUrl));

    expect(result.hostname).toBe("aws-1-sa-east-1.pooler.supabase.com");
    expect(result.port).toBe("6543");
    expect(result.username).toBe("postgres.hnyswnefymnszuqzrewm");
    expect(result.password).toBe("secret");
    expect(result.searchParams.get("sslmode")).toBe("require");
  });

  it("mantém URLs que não pertencem ao host direto configurado", () => {
    const localUrl = "postgresql://user:secret@localhost:5432/crm";

    expect(resolveDatabaseConnectionString(localUrl)).toBe(localUrl);
  });
});
