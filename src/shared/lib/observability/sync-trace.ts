/**
 * Tracer leve por sincronização — resolve o achado da auditoria de
 * performance ("sem sync_id, sem tracing por etapa, hoje é impossível
 * responder onde uma sincronização gastou tempo").
 *
 * Decisão deliberada: sem tabela nova no banco. Uma tabela de trace grava
 * uma linha por etapa, por sincronização — no volume medido (webhook do ML
 * chamado centenas de milhares de vezes/mês), isso viraria a próxima
 * consulta de alto volume do pg_stat_statements, o mesmo tipo de problema
 * que acabamos de corrigir. Log estruturado (console.log em JSON) já é
 * capturado pelos logs de função da Vercel — pesquisável por syncId, sem
 * custo de escrita no banco de produção.
 */

function idCurto(): string {
  return Math.random().toString(36).slice(2, 7);
}

/** `ml-a7f3k` — prefixo diz a origem, sufixo é só pra diferenciar em buscas de log. */
export function criarSyncId(prefixo: string): string {
  return `${prefixo}-${idCurto()}`;
}

export interface SyncTracer {
  syncId: string;
  /** Mede uma etapa e loga a duração dela sozinha — chame em volta de cada
   *  operação que a auditoria pediu pra distinguir (ex: "ML API" separado
   *  de "Database"). Repassa o retorno de `fn`, então dá pra usar no meio
   *  de uma cadeia de `await` normal sem mudar a lógica em volta. */
  etapa<T>(nome: string, fn: () => Promise<T>): Promise<T>;
  /** Loga o resumo com todas as etapas lado a lado (o formato de waterfall
   *  do pedido original) e o total. Chame uma vez, ao final do fluxo —
   *  inclusive no caminho de erro, senão a sincronização que mais precisa
   *  de diagnóstico (a que falhou) é a que não deixa rastro. */
  finalizar(status: "ok" | "erro", detalhe?: string): void;
}

export function iniciarSyncTrace(prefixo: string, contexto?: Record<string, unknown>): SyncTracer {
  const syncId = criarSyncId(prefixo);
  const inicio = Date.now();
  const etapas: Array<{ nome: string; ms: number }> = [];

  console.log(JSON.stringify({ evento: "sync.iniciado", syncId, ...contexto, timestamp: new Date().toISOString() }));

  return {
    syncId,
    async etapa<T>(nome: string, fn: () => Promise<T>): Promise<T> {
      const t0 = Date.now();
      try {
        const resultado = await fn();
        const ms = Date.now() - t0;
        etapas.push({ nome, ms });
        console.log(JSON.stringify({ evento: "sync.etapa", syncId, etapa: nome, ms }));
        return resultado;
      } catch (error) {
        const ms = Date.now() - t0;
        etapas.push({ nome: `${nome} (falhou)`, ms });
        console.log(JSON.stringify({ evento: "sync.etapa", syncId, etapa: nome, ms, erro: true }));
        throw error;
      }
    },
    finalizar(status, detalhe) {
      const totalMs = Date.now() - inicio;
      console.log(JSON.stringify({
        evento: "sync.finalizado",
        syncId,
        status,
        detalhe,
        totalMs,
        etapas,
      }));
    },
  };
}
