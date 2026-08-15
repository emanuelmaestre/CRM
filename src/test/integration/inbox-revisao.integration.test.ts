import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import {
  receberMensagem,
  listarConversas,
  listarMensagens,
  listarPerguntas,
  enviarMensagem,
  responderPergunta,
  avancarStatusConversa,
} from "@/modules/inbox/application/inbox.service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para a revisão integrada do inbox.");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

const ids = { org: randomUUID(), brand: randomUUID(), conta: randomUUID(), contaShopee: randomUUID() };
process.env.DEFAULT_ORG_ID ??= ids.org;

const ctx: CrudContext = { db, orgId: ids.org, perfil: "admin" };

beforeAll(async () => {
  await sql`insert into public.org (id, name, cnpj) values (${ids.org}, 'Revisao Inbox', ${`test-${ids.org}`})`;
  await sql`insert into public.brand (id, org_id, name, slug) values (${ids.brand}, ${ids.org}, 'Marca revisao', 'karzi')`;
  await sql`
    insert into public.channel_account (id, org_id, brand_id, tipo, nome, status, vault_key)
    values (${ids.conta}, ${ids.org}, ${ids.brand}, 'mercadolivre', 'ML revisao', 'conectado', 'vault/ml-revisao')
  `;
  await sql`
    insert into public.channel_account (id, org_id, brand_id, tipo, nome, status, vault_key)
    values (${ids.contaShopee}, ${ids.org}, ${ids.brand}, 'shopee', 'Shopee revisao', 'conectado', 'vault/shopee-revisao')
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

async function receberChat(texto: string, externalConversaId?: string) {
  return receberMensagem({
    orgId: ids.org,
    brandId: ids.brand,
    channelAccountId: ids.conta,
    externalConversaId,
    providerMessageId: `ml-message:${randomUUID()}`,
    conteudo: texto,
    tipo: "texto",
    meta: { canal: "mercadolivre", packId: "pack-1", sellerId: "seller-1" },
  });
}

describe.sequential("inbox — revisão dos fluxos de mensagem", () => {
  it("recebe uma mensagem e a conversa aparece na aba Conversas", async () => {
    const externalId = `ml-pack:${randomUUID()}`;
    const { conversaId } = await receberChat("Oi, chegou meu pedido?", externalId);

    const conversas = await listarConversas(ids.org, { brandId: ids.brand });
    expect(conversas.map((c) => c.id)).toContain(conversaId);
  });

  it("lista as mensagens da conversa (a UI inverte para ordem cronológica)", async () => {
    const externalId = `ml-pack:${randomUUID()}`;
    const { conversaId } = await receberChat("Primeira", externalId);
    await receberChat("Segunda", externalId);

    const mensagens = await listarMensagens(ids.org, conversaId);
    expect(mensagens).toHaveLength(2);
    // O service devolve do mais novo para o mais antigo.
    expect(mensagens[0].conteudo).toBe("Segunda");

    const conversas = await listarConversas(ids.org, { brandId: ids.brand });
    const conversa = conversas.find((item) => item.id === conversaId);
    expect(conversa?.ultimaMensagem).toMatchObject({
      conteudo: "Segunda",
      direcao: "entrada",
    });
  });

  it("move a conversa ativa para o topo quando chega uma nova mensagem", async () => {
    const primeiraId = `ml-pack:${randomUUID()}`;
    const segundaId = `ml-pack:${randomUUID()}`;
    const primeira = await receberChat("Conversa mais antiga", primeiraId);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await receberChat("Outra conversa", segundaId);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await receberChat("Nova mensagem na primeira", primeiraId);

    const conversas = await listarConversas(ids.org, { brandId: ids.brand });
    expect(conversas[0].id).toBe(primeira.conversaId);
    expect(conversas[0].ultimaMensagem?.conteudo).toBe("Nova mensagem na primeira");
  });

  it("é idempotente: o mesmo providerMessageId não duplica mensagem", async () => {
    const externalId = `ml-pack:${randomUUID()}`;
    const providerMessageId = `ml-message:${randomUUID()}`;
    const entrada = {
      orgId: ids.org,
      brandId: ids.brand,
      channelAccountId: ids.conta,
      externalConversaId: externalId,
      providerMessageId,
      conteudo: "Reentrega do webhook",
      tipo: "texto",
    };
    const primeira = await receberMensagem(entrada);
    const segunda = await receberMensagem(entrada);

    expect(segunda.mensagemId).toBe(primeira.mensagemId);
    expect(await listarMensagens(ids.org, primeira.conversaId)).toHaveLength(1);
  });

  it("separa perguntas pré-venda das conversas de chat", async () => {
    const { conversaId: perguntaId } = await receberMensagem({
      orgId: ids.org,
      brandId: ids.brand,
      channelAccountId: ids.conta,
      externalConversaId: `ml-question:item-9-${randomUUID()}`,
      providerMessageId: `ml-question:${randomUUID()}`,
      conteudo: "Tem na cor azul?",
      tipo: "texto",
      meta: { canal: "mercadolivre", itemId: "item-9", remetenteId: 42, questionId: "q-9" },
    });

    const perguntas = await listarPerguntas(ids.org, { brandId: ids.brand });
    const conversas = await listarConversas(ids.org, { brandId: ids.brand });

    expect(perguntas.map((p) => p.id)).toContain(perguntaId);
    expect(conversas.map((c) => c.id)).not.toContain(perguntaId);
    expect(perguntas.find((p) => p.id === perguntaId)?.status).toBe("pendente");
  });

  it("REGRESSÃO: conversa sem externalId some da aba Conversas", async () => {
    const { conversaId } = await receberChat("Mensagem sem id externo", undefined);

    const conversas = await listarConversas(ids.org, { brandId: ids.brand });
    expect(conversas.map((c) => c.id)).toContain(conversaId);
  });

  it("respeita a máquina de estados ao avançar status", async () => {
    const { conversaId } = await receberChat("Status", `ml-pack:${randomUUID()}`);

    await avancarStatusConversa(ctx, conversaId, "em_atendimento");
    await expect(avancarStatusConversa(ctx, conversaId, "nova")).rejects.toThrow(/Transição/);
  });

  it("reabre conversa resolvida quando chega mensagem nova", async () => {
    const externalId = `ml-pack:${randomUUID()}`;
    const { conversaId } = await receberChat("Primeira", externalId);
    await avancarStatusConversa(ctx, conversaId, "em_atendimento");
    await avancarStatusConversa(ctx, conversaId, "resolvida");

    await receberChat("Voltei", externalId);

    const conversas = await listarConversas(ids.org, { brandId: ids.brand });
    expect(conversas.find((c) => c.id === conversaId)?.status).toBe("em_atendimento");
  });

  it("bloqueia envio enquanto EXTERNAL_SENDS_ENABLED não for true", async () => {
    const { conversaId } = await receberChat("Quero responder", `ml-pack:${randomUUID()}`);

    // O portão é lido do ambiente; o teste o controla para não depender do .env local.
    const anterior = process.env.EXTERNAL_SENDS_ENABLED;
    process.env.EXTERNAL_SENDS_ENABLED = "false";
    try {
      await expect(enviarMensagem(ctx, conversaId, "Resposta")).rejects.toThrow(/Envios externos desabilitados/);
    } finally {
      process.env.EXTERNAL_SENDS_ENABLED = anterior;
    }
  });

  it("bloqueia envio por canal que não seja Mercado Livre", async () => {
    const { conversaId } = await receberMensagem({
      orgId: ids.org,
      brandId: ids.brand,
      channelAccountId: ids.contaShopee,
      externalConversaId: `shopee:${randomUUID()}`,
      providerMessageId: `shopee:${randomUUID()}`,
      conteudo: "Oi pela Shopee",
      tipo: "texto",
    });

    await expect(enviarMensagem(ctx, conversaId, "Resposta")).rejects.toThrow(/ainda não está habilitado/);
  });

  it("recusa responder uma conversa de chat como se fosse pergunta", async () => {
    const { conversaId } = await receberChat("Sou chat", `ml-pack:${randomUUID()}`);
    await expect(responderPergunta(ctx, conversaId, "Resposta")).rejects.toThrow(/não é uma pergunta/);
  });
});
