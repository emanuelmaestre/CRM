import { eq, inArray } from "drizzle-orm";
import { db as bancoPadrao } from "@/shared/lib/db";
import { canalVerificacao } from "@/shared/lib/db/schema";
import type { ModuloSincronizacao } from "../domain/sincronizacao-progresso";

type Banco = typeof bancoPadrao;

/**
 * Registra que a origem de dado da conta acabou de ser conferida contra o
 * canal — pelo webhook, pela contingência ou pela varredura de saldo.
 *
 * O portão de entrada das telas lê este relógio junto com a última execução
 * bem-sucedida da Central. Sem ele, o caminho normal do pedido (webhook) era
 * invisível para o portão, e cada entrada de tela mandava buscar de novo o
 * que já estava no banco — o gasto de cota que este arquivo existe pra evitar.
 *
 * Nunca derruba quem chamou: um relógio que não gravou faz o portão conferir
 * de novo, que é o comportamento antigo, não um erro para o operador.
 */
export async function registrarVerificacaoCanal(
  orgId: string,
  channelAccountId: string,
  modulo: ModuloSincronizacao,
  banco: Banco = bancoPadrao,
): Promise<void> {
  try {
    await banco
      .insert(canalVerificacao)
      .values({ orgId, channelAccountId, modulo, verificadoEm: new Date() })
      .onConflictDoUpdate({
        target: [canalVerificacao.channelAccountId, canalVerificacao.modulo],
        set: { verificadoEm: new Date() },
      });
  } catch (error) {
    console.warn(`[verificacao-canal] ${modulo}/${channelAccountId} não registrado:`, error);
  }
}

/** Vários módulos da mesma conta em uma ida só. */
export async function registrarVerificacoesCanal(
  orgId: string,
  channelAccountId: string,
  modulos: readonly ModuloSincronizacao[],
  banco: Banco = bancoPadrao,
): Promise<void> {
  for (const modulo of modulos) {
    await registrarVerificacaoCanal(orgId, channelAccountId, modulo, banco);
  }
}

export type VerificacoesPorConta = Map<string, Partial<Record<string, string>>>;

/** Relógio de todas as contas da organização, indexado por conta e módulo. */
export async function obterVerificacoesPorConta(
  banco: Banco,
  orgId: string,
): Promise<VerificacoesPorConta> {
  const linhas = await banco
    .select({
      channelAccountId: canalVerificacao.channelAccountId,
      modulo: canalVerificacao.modulo,
      verificadoEm: canalVerificacao.verificadoEm,
    })
    .from(canalVerificacao)
    .where(eq(canalVerificacao.orgId, orgId));

  const mapa: VerificacoesPorConta = new Map();
  for (const linha of linhas) {
    const atual = mapa.get(linha.channelAccountId) ?? {};
    atual[linha.modulo] = linha.verificadoEm.toISOString();
    mapa.set(linha.channelAccountId, atual);
  }
  return mapa;
}

/** Limpa o relógio das contas informadas — usado quando uma conta é
 *  desconectada e o que ficou registrado deixa de valer. */
export async function limparVerificacoesCanal(
  banco: Banco,
  channelAccountIds: readonly string[],
): Promise<void> {
  if (channelAccountIds.length === 0) return;
  await banco.delete(canalVerificacao).where(inArray(canalVerificacao.channelAccountId, [...channelAccountIds]));
}
