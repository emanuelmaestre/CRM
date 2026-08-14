import { eq, and, count, desc, inArray } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, regua, reguaExecucao, templateMensagem, clienteIdentidade, cliente } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { avaliarGates, type GateInput } from "../domain/gates";
import { format } from "date-fns";

function renderizarTemplate(conteudo: string, variaveis: Record<string, string>): string {
  return conteudo.replace(/\{\{(\w+)\}\}/g, (_, chave) => variaveis[chave] ?? `{{${chave}}}`);
}

function finalidadeDoGatilho(gatilho: string): GateInput["finalidade"] {
  if (gatilho === "pedido_entregue") return "avaliacao";
  return "marketing";
}

export async function dispararRegua(input: {
  orgId: string;
  reguaId: string;
  clienteId: string;
  brandId: string;
  canalOrigem: string;
  gatilhoData: Date;
}): Promise<{ status: string; motivoBloqueio?: string; gateBloqueado?: string }> {
  const reguaRow = await db
    .select()
    .from(regua)
    .where(and(eq(regua.id, input.reguaId), eq(regua.orgId, input.orgId)))
    .then((r) => r[0]);

  if (!reguaRow || reguaRow.status !== "ativa") {
    return { status: "bloqueada", motivoBloqueio: "Régua inativa ou não encontrada" };
  }

  if (reguaRow.brandId !== input.brandId) {
    return { status: "bloqueada", motivoBloqueio: "Régua não pertence à marca informada", gateBloqueado: "gate_3" };
  }

  const dataRef = format(input.gatilhoData, "yyyy-MM-dd");
  const idempotencyKey = `${input.reguaId}:${input.clienteId}:${reguaRow.gatilho}:${dataRef}`;

  const gateInput: GateInput = {
    orgId: input.orgId,
    reguaId: input.reguaId,
    clienteId: input.clienteId,
    brandId: input.brandId,
    finalidade: finalidadeDoGatilho(reguaRow.gatilho),
    canal: reguaRow.canal,
    canalOrigem: input.canalOrigem,
    idempotencyKey,
    templateId: reguaRow.templateId ?? "",
    cooldownHoras: reguaRow.cooldownHoras,
    limiteDiarioCliente: reguaRow.limiteDiarioCliente,
  };

  const gateResult = await avaliarGates(gateInput);

  if (!gateResult.aprovado) {
    if (gateResult.gateBloqueado === "gate_4") {
      return { status: "duplicada", motivoBloqueio: gateResult.motivo, gateBloqueado: gateResult.gateBloqueado };
    }

    const [execucaoBloqueada] = await db.insert(reguaExecucao).values({
      orgId: input.orgId,
      reguaId: input.reguaId,
      clienteId: input.clienteId,
      idempotencyKey,
      status: "bloqueada",
      gateBloqueado: gateResult.gateBloqueado,
      motivoBloqueio: gateResult.motivo,
    }).returning({ id: reguaExecucao.id });

    await emitirEvento({
      tipo: "regua.bloqueada",
      orgId: input.orgId,
      brandId: input.brandId,
      entidade: "regua_execucao",
      entidadeId: execucaoBloqueada.id,
      payload: { reguaId: input.reguaId, clienteId: input.clienteId, gate: gateResult.gateBloqueado, motivo: gateResult.motivo },
    });

    return { status: "bloqueada", motivoBloqueio: gateResult.motivo, gateBloqueado: gateResult.gateBloqueado };
  }

  const [execucao] = await db.insert(reguaExecucao).values({
    orgId: input.orgId,
    reguaId: input.reguaId,
    clienteId: input.clienteId,
    idempotencyKey,
    status: "gates_aprovados",
    agendadaEm: new Date(),
  }).returning();

  // --- Envio real da mensagem ---
  try {
    const [template, clienteRow] = await Promise.all([
      reguaRow.templateId
        ? db.select().from(templateMensagem).where(and(
            eq(templateMensagem.id, reguaRow.templateId),
            eq(templateMensagem.orgId, input.orgId),
            eq(templateMensagem.brandId, input.brandId),
            eq(templateMensagem.canal, reguaRow.canal),
          )).then((r) => r[0])
        : Promise.resolve(null),
      db.select().from(cliente).where(and(
        eq(cliente.id, input.clienteId),
        eq(cliente.orgId, input.orgId),
      )).then((r) => r[0]),
    ]);

    if (!template) throw new Error("Template não encontrado ou não configurado na régua.");

    // Buscar contato do canal configurado na régua
    const identidade = await db
      .select()
      .from(clienteIdentidade)
      .where(and(
        eq(clienteIdentidade.clienteId, input.clienteId),
        eq(clienteIdentidade.orgId, input.orgId),
        eq(clienteIdentidade.canal, reguaRow.canal as "whatsapp"),
      ))
      .then((r) => r[0]);

    const para = identidade?.externalId ?? clienteRow?.telefone;
    if (!para) throw new Error(`Sem contato disponível no canal ${reguaRow.canal} para este cliente.`);

    const variaveis: Record<string, string> = {
      nome: clienteRow?.nome ?? "",
      canal: reguaRow.canal,
      ...(typeof template.variaveis === "object" && template.variaveis !== null ? template.variaveis as Record<string, string> : {}),
    };
    const conteudoFinal = renderizarTemplate(template.conteudo, variaveis);

    // Réguas de mensageria foram desativadas; o Mercado Livre só permite
    // responder a interações já iniciadas pelo comprador no Inbox.
    // Perguntas e pós-venda do Mercado Livre só respondem a interações existentes no Inbox.
    void para;
    void conteudoFinal;
    throw new Error(`Canal ${reguaRow.canal} sem provider de envio de régua configurado.`);

    await db.update(reguaExecucao)
      .set({ status: "enviada", enviadaEm: new Date(), updatedAt: new Date() })
      .where(eq(reguaExecucao.id, execucao.id));

    await emitirEvento({
      tipo: "regua.disparada",
      orgId: input.orgId,
      brandId: input.brandId,
      entidade: "regua_execucao",
      entidadeId: execucao.id,
      payload: { reguaId: input.reguaId, clienteId: input.clienteId, canal: reguaRow.canal },
    });

    return { status: "enviada" };

  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);

    await db.update(reguaExecucao)
      .set({ status: "falha_definitiva", motivoBloqueio: `Falha no envio: ${motivo}`, updatedAt: new Date() })
      .where(eq(reguaExecucao.id, execucao.id));

    await emitirEvento({
      tipo: "regua.falha_definitiva",
      orgId: input.orgId,
      brandId: input.brandId,
      entidade: "regua_execucao",
      entidadeId: execucao.id,
      payload: { reguaId: input.reguaId, clienteId: input.clienteId, motivo },
    });

    return { status: "falha", motivoBloqueio: motivo };
  }
}

export async function cancelarExecucoesCliente(orgId: string, clienteId: string): Promise<void> {
  await db
    .update(reguaExecucao)
    .set({ status: "bloqueada", motivoBloqueio: "Opt-out registrado — execuções canceladas", updatedAt: new Date() })
    .where(
      and(
        eq(reguaExecucao.orgId, orgId),
        eq(reguaExecucao.clienteId, clienteId),
        inArray(reguaExecucao.status, ["elegivel", "gates_aprovados", "agendada"])
      )
    );
}

/** Histórico de disparos das réguas, com os nomes já resolvidos para exibição.
 *
 *  Devolve junto o total de réguas cadastradas porque isso muda o sentido de um
 *  histórico vazio: sem nenhuma régua, não há o que executar e a lista vazia é o
 *  estado correto — não uma falha. Hoje não existe tela para criar régua, então
 *  esse é o caso normal. */
export async function listarHistoricoAutomacoes(orgId: string, limite = 200) {
  const [execucoes, reguas] = await Promise.all([
    db
      .select({
        id: reguaExecucao.id,
        createdAt: reguaExecucao.createdAt,
        reguaNome: regua.nome,
        clienteNome: cliente.nome,
        brandNome: brand.name,
        status: reguaExecucao.status,
        gate: reguaExecucao.gateBloqueado,
        motivo: reguaExecucao.motivoBloqueio,
      })
      .from(reguaExecucao)
      .innerJoin(regua, eq(regua.id, reguaExecucao.reguaId))
      .innerJoin(cliente, eq(cliente.id, reguaExecucao.clienteId))
      .innerJoin(brand, eq(brand.id, regua.brandId))
      .where(eq(reguaExecucao.orgId, orgId))
      .orderBy(desc(reguaExecucao.createdAt))
      .limit(limite),
    db.select({ total: count() }).from(regua).where(eq(regua.orgId, orgId)),
  ]);

  return {
    execucoes: execucoes.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    reguasCadastradas: reguas[0]?.total ?? 0,
  };
}

export async function listarExecucoes(orgId: string, opts: { reguaId?: string; status?: string } = {}) {
  const conditions = [eq(reguaExecucao.orgId, orgId)];
  if (opts.reguaId) conditions.push(eq(reguaExecucao.reguaId, opts.reguaId));
  if (opts.status) conditions.push(eq(reguaExecucao.status, opts.status as never));

  return db.select().from(reguaExecucao).where(and(...conditions));
}
