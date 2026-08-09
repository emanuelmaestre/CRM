import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// O envio real sai por este provider. Aqui ele é dublê: o teste cobre a
// persistência e a mudança de status, nunca a API do Mercado Livre.
vi.mock("@/modules/canais/infrastructure/mercadolivre.provider", () => ({
  criarMLProvider: async () => ({
    responderPergunta: async (questionId: string) => ({ questionId, status: "ANSWERED" }),
  }),
}));
import type { CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { receberMensagem, listarPerguntas, responderPergunta } from "@/modules/inbox/application/inbox.service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para o teste integrado de perguntas do inbox.");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

const ids = {
  org: randomUUID(),
  brand: randomUUID(),
  conta: randomUUID(),
};
process.env.DEFAULT_ORG_ID ??= ids.org;
// Este arquivo cobre o caminho de resposta; o portão de go-live é do ambiente,
// então o teste o fixa em vez de herdar o .env local.
process.env.EXTERNAL_SENDS_ENABLED = "true";

const ctx: CrudContext = { db, orgId: ids.org, perfil: "admin" };

beforeAll(async () => {
  await sql`insert into public.org (id, name, cnpj) values (${ids.org}, 'Perguntas Inbox', ${`test-${ids.org}`})`;
  await sql`insert into public.brand (id, org_id, name, slug) values (${ids.brand}, ${ids.org}, 'Marca perguntas', 'karzi')`;
  await sql`
    insert into public.channel_account (id, org_id, brand_id, tipo, nome, status, vault_key)
    values (${ids.conta}, ${ids.org}, ${ids.brand}, 'mercadolivre', 'ML teste', 'conectado', 'vault/ml-teste')
  `;
});

afterAll(async () => {
  await sql`delete from public.mensagem where org_id = ${ids.org}`;
  await sql`delete from public.conversa where org_id = ${ids.org}`;
  await sql`delete from public.evento_dominio where org_id = ${ids.org}`;
  await sql`delete from public.channel_account where org_id = ${ids.org}`;
  await sql`delete from public.brand where org_id = ${ids.org}`;
  await sql`delete from public.org where id = ${ids.org}`;
  await sql.end();
});

describe.sequential("inbox — perguntas pré-venda de marketplace", () => {
  it("lista uma pergunta recebida via webhook como pendente", async () => {
    await receberMensagem({
      orgId: ids.org,
      brandId: ids.brand,
      channelAccountId: ids.conta,
      externalConversaId: `ml-question:item-123-${randomUUID()}`,
      providerMessageId: `ml-question:${randomUUID()}`,
      conteudo: "Tem esse produto na cor azul?",
      tipo: "texto",
      meta: { canal: "mercadolivre", itemId: "item-123", remetenteId: 555 },
    });

    const perguntas = await listarPerguntas(ids.org, { brandId: ids.brand });
    expect(perguntas).toHaveLength(1);
    expect(perguntas[0].status).toBe("pendente");
    expect(perguntas[0].pergunta).toBe("Tem esse produto na cor azul?");
    expect(perguntas[0].canal).toBe("mercadolivre");
  });

  it("não lista conversas de chat comuns (sem marcador de pergunta)", async () => {
    await receberMensagem({
      orgId: ids.org,
      brandId: ids.brand,
      channelAccountId: ids.conta,
      externalConversaId: `chat-comum-${randomUUID()}`,
      providerMessageId: `msg-${randomUUID()}`,
      conteudo: "Mensagem de chat normal",
      tipo: "texto",
    });

    const perguntas = await listarPerguntas(ids.org, { brandId: ids.brand });
    expect(perguntas.every((p) => p.pergunta !== "Mensagem de chat normal")).toBe(true);
  });

  it("responder marca a pergunta como respondida e resolve a conversa", async () => {
    const externalId = `ml-question:item-456-${randomUUID()}`;
    await receberMensagem({
      orgId: ids.org,
      brandId: ids.brand,
      channelAccountId: ids.conta,
      externalConversaId: externalId,
      providerMessageId: `ml-question:${randomUUID()}`,
      conteudo: "Qual o prazo de entrega?",
      tipo: "texto",
      meta: { canal: "mercadolivre", itemId: "item-456", questionId: `q-${randomUUID()}` },
    });

    const [pergunta] = await listarPerguntas(ids.org, { brandId: ids.brand })
      .then((itens) => itens.filter((i) => i.pergunta === "Qual o prazo de entrega?"));
    expect(pergunta.status).toBe("pendente");

    await responderPergunta(ctx, pergunta.id, "Entregamos em até 3 dias úteis.");

    const [atualizada] = await listarPerguntas(ids.org, { brandId: ids.brand })
      .then((itens) => itens.filter((i) => i.id === pergunta.id));
    expect(atualizada.status).toBe("respondida");
    expect(atualizada.resposta).toBe("Entregamos em até 3 dias úteis.");
  });

  it("rejeita responder uma conversa que não é pergunta pré-venda", async () => {
    const { conversaId } = await receberMensagem({
      orgId: ids.org,
      brandId: ids.brand,
      channelAccountId: ids.conta,
      externalConversaId: `chat-normal-${randomUUID()}`,
      providerMessageId: `msg-${randomUUID()}`,
      conteudo: "Oi",
      tipo: "texto",
    });

    await expect(responderPergunta(ctx, conversaId, "Resposta indevida")).rejects.toThrow();
  });
});
