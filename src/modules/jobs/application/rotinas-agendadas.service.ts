import { and, desc, eq, inArray } from "drizzle-orm";
import { type CrudContext } from "@/shared/lib/crud-factory";
import { jobRun } from "@/shared/lib/db/schema";

type StatusRotina = "ok" | "atrasado" | "falhou" | "rodando" | "sem_registro";

const MINUTO = 60_000;

const ROTINAS_AGENDADAS = [
  {
    nome: "A24-poll-pedidos",
    titulo: "Pedidos dos canais de vendas",
    categoria: "Pedidos",
    // Contingência do webhook, não o caminho principal de um pedido novo — ver
    // INTERVALO_POLL_HORAS em A24-poll-pedidos.ts, que é a fonte da verdade do
    // cron. Este limite de atraso dá uma volta inteira de folga.
    agenda: "a cada 3 horas",
    cron: "0 */3 * * *",
    atrasoLimiteMinutos: 6 * 60,
  },
  {
    nome: "A34-reconciliar-pedidos",
    titulo: "Reconciliação de pedidos dos últimos dias",
    categoria: "Pedidos",
    // Rede de segurança de trás da rede de segurança: a A24 cobre webhook
    // perdido dentro da janela dela, esta cobre o que escapou das duas — ver
    // DIAS_RECONCILIACAO em A34-reconciliar-pedidos.ts. Diário, então o limite
    // de atraso dá um dia inteiro de folga.
    agenda: "uma vez por dia",
    cron: "0 5 * * *",
    atrasoLimiteMinutos: 48 * 60,
  },
  {
    nome: "A18-saude-conectores",
    titulo: "Verificação de integridade dos conectores",
    categoria: "Canais",
    agenda: "a cada 3 horas",
    cron: "7 */3 * * *",
    atrasoLimiteMinutos: 6 * 60,
  },
  {
    nome: "A28-sync-avaliacoes-ml",
    titulo: "Avaliações do Mercado Livre",
    categoria: "Pós-venda",
    agenda: "quatro vezes por dia",
    cron: "17 */6 * * *",
    atrasoLimiteMinutos: 12 * 60,
  },
  {
    nome: "A5-reconciliacao-saldo",
    titulo: "Reconciliação de saldo",
    categoria: "Estoque",
    // Rede de segurança do estoque, não o caminho principal — ver
    // INTERVALO_COLETA_HORAS em A5-reconciliacao-saldo.ts, fonte da verdade do
    // cron. O limite de atraso dá uma volta inteira de folga.
    agenda: "a cada 6 horas",
    cron: "0 */6 * * *",
    atrasoLimiteMinutos: 12 * 60,
  },
  {
    nome: "A23-refresh-ml-tokens",
    titulo: "Renovação de credenciais do Mercado Livre",
    categoria: "Canais",
    agenda: "a cada hora",
    cron: "0 * * * *",
    atrasoLimiteMinutos: 180,
  },
  {
    nome: "A33-refresh-shopee-tokens",
    titulo: "Renovação de credenciais da Shopee",
    categoria: "Canais",
    agenda: "a cada hora",
    cron: "12 * * * *",
    atrasoLimiteMinutos: 180,
  },
  {
    nome: "A21-guarda-consumo-ia",
    titulo: "Guarda de consumo IA",
    categoria: "IA",
    agenda: "a cada 6 horas",
    cron: "0 */6 * * *",
    atrasoLimiteMinutos: 540,
  },
  {
    nome: "A13-scores-cliente",
    titulo: "Pontuações de clientes",
    categoria: "CRM",
    agenda: "todo dia às 2h",
    cron: "0 2 * * *",
    atrasoLimiteMinutos: 2160,
  },
  {
    nome: "A14-scores-produto",
    titulo: "Pontuações de produtos",
    categoria: "Estoque",
    agenda: "todo dia às 2h",
    cron: "0 2 * * *",
    atrasoLimiteMinutos: 2160,
  },
  {
    nome: "A6-alerta-minimo",
    titulo: "Alerta de estoque mínimo",
    categoria: "Estoque",
    agenda: "todo dia às 3h30",
    cron: "30 3 * * *",
    atrasoLimiteMinutos: 2160,
  },
  {
    nome: "A20-backup-verificacao",
    titulo: "Verificação da cópia de segurança",
    categoria: "Operação",
    agenda: "todo dia às 4h",
    cron: "0 4 * * *",
    atrasoLimiteMinutos: 2160,
  },
  {
    nome: "A32-sync-anuncios-ads",
    titulo: "Anúncios patrocinados",
    categoria: "Anúncios",
    agenda: "todo dia às 6h",
    cron: "0 6 * * *",
    atrasoLimiteMinutos: 2160,
  },
  {
    nome: "A9-regua-aniversario",
    titulo: "Régua de aniversário",
    categoria: "Relacionamento",
    agenda: "todo dia às 9h",
    cron: "0 9 * * *",
    atrasoLimiteMinutos: 2160,
  },
  {
    nome: "A10-regua-reativacao",
    titulo: "Régua de reativação",
    categoria: "Relacionamento",
    agenda: "dias úteis às 10h",
    cron: "0 10 * * 1-5",
    atrasoLimiteMinutos: 5760,
  },
  {
    nome: "A15-insights-funil",
    titulo: "Análises executivas por IA",
    categoria: "IA",
    agenda: "segunda às 7h",
    cron: "0 7 * * 1",
    atrasoLimiteMinutos: 11520,
  },
  {
    nome: "A16-sugestoes-campanha",
    titulo: "Sugestões de campanha IA",
    categoria: "IA",
    agenda: "segunda às 8h",
    cron: "0 8 * * 1",
    atrasoLimiteMinutos: 11520,
  },
  {
    nome: "A22-lgpd-retencao",
    titulo: "Retenção LGPD",
    categoria: "Segurança",
    agenda: "dia 1 às 3h",
    cron: "0 3 1 * *",
    atrasoLimiteMinutos: 50400,
  },
] as const;

function statusDaRotina(
  execucao: { status: string; erro: string | null; iniciadoEm: Date; finalizadoEm: Date | null } | undefined,
  atrasoLimiteMinutos: number,
  agora: Date,
): StatusRotina {
  if (!execucao) return "sem_registro";
  if (execucao.status === "rodando") return "rodando";
  if (execucao.status === "falhou" || execucao.status === "erro" || execucao.erro) return "falhou";

  const referencia = execucao.finalizadoEm ?? execucao.iniciadoEm;
  const idadeMinutos = (agora.getTime() - referencia.getTime()) / MINUTO;
  return idadeMinutos > atrasoLimiteMinutos ? "atrasado" : "ok";
}

export async function listarRotinasAgendadas(ctx: CrudContext) {
  const nomes = ROTINAS_AGENDADAS.map((rotina) => rotina.nome);
  const execucoes = await ctx.db
    .select({
      id: jobRun.id,
      nome: jobRun.nome,
      status: jobRun.status,
      tentativa: jobRun.tentativa,
      erro: jobRun.erro,
      iniciadoEm: jobRun.iniciadoEm,
      finalizadoEm: jobRun.finalizadoEm,
    })
    .from(jobRun)
    .where(and(eq(jobRun.orgId, ctx.orgId), inArray(jobRun.nome, nomes)))
    .orderBy(desc(jobRun.iniciadoEm))
    .limit(nomes.length * 5);

  const ultimaPorNome = new Map<(typeof nomes)[number], (typeof execucoes)[number]>();
  for (const execucao of execucoes) {
    if (!ultimaPorNome.has(execucao.nome as (typeof nomes)[number])) {
      ultimaPorNome.set(execucao.nome as (typeof nomes)[number], execucao);
    }
  }

  const agora = new Date();
  const itens = ROTINAS_AGENDADAS.map((rotina) => {
    const ultima = ultimaPorNome.get(rotina.nome);
    const status = statusDaRotina(ultima, rotina.atrasoLimiteMinutos, agora);
    return {
      nome: rotina.nome,
      titulo: rotina.titulo,
      categoria: rotina.categoria,
      agenda: rotina.agenda,
      cron: rotina.cron,
      status,
      tentativa: ultima?.tentativa ?? null,
      erro: ultima?.erro ?? null,
      ultimaExecucaoEm: ultima?.iniciadoEm.toISOString() ?? null,
      finalizadoEm: ultima?.finalizadoEm?.toISOString() ?? null,
    };
  });

  return {
    total: itens.length,
    ok: itens.filter((item) => item.status === "ok").length,
    atrasadas: itens.filter((item) => item.status === "atrasado").length,
    falhas: itens.filter((item) => item.status === "falhou").length,
    rodando: itens.filter((item) => item.status === "rodando").length,
    semRegistro: itens.filter((item) => item.status === "sem_registro").length,
    atualizadoEm: agora.toISOString(),
    itens,
  };
}
