import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const providerMock = vi.hoisted(() => ({
  listarMensagensReclamacao: vi.fn(),
  responderReclamacao: vi.fn(),
}));

// Reclamação não é persistida localmente — a camada de serviço só decide
// para quem a resposta vai (complainant x mediator) e confere a conta
// conectada; a chamada real ao Mercado Livre é dublê aqui.
vi.mock("@/modules/canais/infrastructure/mercadolivre.provider", () => ({
  criarMLProvider: async () => providerMock,
}));

import type { CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import {
  listarMensagensReclamacao,
  responderReclamacao,
} from "@/modules/relatorios/application/reclamacoes.service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste de mensagens de reclamação.");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

const ids = { org: randomUUID(), brand: randomUUID(), conta: randomUUID() };
process.env.DEFAULT_ORG_ID ??= ids.org;
process.env.EXTERNAL_SENDS_ENABLED = "true";

const ctx: CrudContext = { db, orgId: ids.org, perfil: "admin" };

beforeAll(async () => {
  await sql`insert into public.org (id, name, cnpj) values (${ids.org}, 'Reclamacoes Mensagens', ${`test-${ids.org}`})`;
  await sql`insert into public.brand (id, org_id, name, slug) values (${ids.brand}, ${ids.org}, 'Marca reclamacoes', 'karzi')`;
  await sql`
    insert into public.channel_account (id, org_id, brand_id, tipo, nome, status, vault_key)
    values (${ids.conta}, ${ids.org}, ${ids.brand}, 'mercadolivre', 'ML reclamacoes', 'conectado', 'vault/ml-reclamacoes')
  `;
});

afterEach(() => {
  providerMock.listarMensagensReclamacao.mockReset();
  providerMock.responderReclamacao.mockReset();
});

afterAll(async () => {
  await sql`delete from public.channel_account where org_id = ${ids.org}`;
  await sql`delete from public.brand where org_id = ${ids.org}`;
  await sql`delete from public.org where id = ${ids.org}`;
  await sql.end();
});

describe.sequential("reclamações — mensagens e resposta", () => {
  it("lista mensagens e marca quais são do vendedor", async () => {
    providerMock.listarMensagensReclamacao.mockResolvedValue([
      { remetente: "complainant", destinatario: "respondent", texto: "Cadê meu produto?", criadaEm: "2026-02-01T00:00:00Z" },
      { remetente: "respondent", destinatario: "complainant", texto: "Já estamos verificando.", criadaEm: "2026-02-02T00:00:00Z" },
    ]);

    const mensagens = await listarMensagensReclamacao(ctx, "karzi", "5204934310");

    expect(mensagens).toEqual([
      { deVendedor: false, destinatario: "respondent", texto: "Cadê meu produto?", criadaEm: "2026-02-01T00:00:00Z" },
      { deVendedor: true, destinatario: "complainant", texto: "Já estamos verificando.", criadaEm: "2026-02-02T00:00:00Z" },
    ]);
  });

  it("recusa listar mensagens para marca sem conta Mercado Livre conectada", async () => {
    await expect(listarMensagensReclamacao(ctx, "wuwu", "5204934310"))
      .rejects.toThrow(/não conectada/);
  });

  it("responde ao reclamante quando a reclamação não está em mediação", async () => {
    await responderReclamacao(ctx, "karzi", "5204934310", "Vamos resolver.", false);

    expect(providerMock.responderReclamacao).toHaveBeenCalledWith("5204934310", "Vamos resolver.", "complainant");
  });

  it("responde ao mediador quando a reclamação está em mediação", async () => {
    await responderReclamacao(ctx, "karzi", "5204934310", "Segue comprovante.", true);

    expect(providerMock.responderReclamacao).toHaveBeenCalledWith("5204934310", "Segue comprovante.", "mediator");
  });

  it("bloqueia envio enquanto EXTERNAL_SENDS_ENABLED não for true", async () => {
    const anterior = process.env.EXTERNAL_SENDS_ENABLED;
    process.env.EXTERNAL_SENDS_ENABLED = "false";
    try {
      await expect(responderReclamacao(ctx, "karzi", "5204934310", "Oi", false))
        .rejects.toThrow(/Envios externos desabilitados/);
      expect(providerMock.responderReclamacao).not.toHaveBeenCalled();
    } finally {
      process.env.EXTERNAL_SENDS_ENABLED = anterior;
    }
  });

  it("recusa responder para marca sem conta Mercado Livre conectada", async () => {
    await expect(responderReclamacao(ctx, "wuwu", "5204934310", "Oi", false))
      .rejects.toThrow(/não conectada/);
    expect(providerMock.responderReclamacao).not.toHaveBeenCalled();
  });
});
