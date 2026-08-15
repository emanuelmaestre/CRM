import { sql } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";

/* ── Funil de atendimento (SLA de resposta) ──────────────────────
   O dado já está no Inbox: cada `mensagem` tem direção e horário. O
   que faltava era agregá-lo. "Tempo de resposta" aqui é o intervalo
   entre uma pergunta do cliente e a primeira resposta nossa depois
   dela — e só conta como pergunta a mensagem de entrada que abre um
   turno (a anterior na conversa foi nossa, ou não havia anterior).
   Sem isso, cliente que manda três mensagens seguidas viraria três
   "perguntas", inflando artificialmente o volume e distorcendo a
   média para baixo (as duas últimas seriam respondidas "junto"). */

/** Baldes do funil, do melhor para o pior. Os cortes são os que um
 *  comprador percebe: uma hora ainda parece atendimento ao vivo, um
 *  dia já é "me responderam depois", mais que isso é abandono.
 *
 *  `cor` referencia um token da rampa ordinal do design system em vez de
 *  trazer o hex fixo que ficava aqui. Cor decidida no servidor nunca pode
 *  responder ao tema: um hex escolhido contra fundo branco chega igual à
 *  Cabine, onde reprova em contraste. A variável resolve no navegador. */
export const FAIXAS_SLA = [
  { chave: "ate1h", label: "Até 1 hora", horas: 1, cor: "var(--escala-5)" },
  { chave: "ate4h", label: "1 a 4 horas", horas: 4, cor: "var(--escala-4)" },
  { chave: "ate24h", label: "4 a 24 horas", horas: 24, cor: "var(--escala-3)" },
  { chave: "acima24h", label: "Mais de 24 horas", horas: null, cor: "var(--escala-2)" },
  { chave: "semResposta", label: "Sem resposta", horas: null, cor: "var(--escala-1)" },
] as const;

export type ChaveFaixaSla = (typeof FAIXAS_SLA)[number]["chave"];

export interface FaixaAtendimento {
  chave: ChaveFaixaSla;
  label: string;
  cor: string;
  quantidade: number;
  /** Participação no total de perguntas (0–100), já pronta para a barra. */
  participacao: number;
}

export interface AtendimentoResumo {
  /** Perguntas de cliente que abriram um turno no período. */
  perguntas: number;
  respondidas: number;
  /** 0–100. Null quando não houve pergunta nenhuma no período. */
  taxaResposta: number | null;
  /** Segundos até a primeira resposta. Null sem nenhuma resposta no período. */
  medianaSegundos: number | null;
  medianaLabel: string | null;
  /** Mediana, não média, de propósito: uma única conversa esquecida por três
   *  semanas puxaria a média para um número que não descreve dia nenhum. */
  faixas: FaixaAtendimento[];
  /** Comparação com a janela anterior de mesmo tamanho, em pontos percentuais
   *  da taxa de resposta. Null sem base de comparação. */
  variacaoTaxaResposta: number | null;
  /** Taxa de resposta da janela anterior — o outro lado exato de
   *  `variacaoTaxaResposta`, que por si só só mostra a diferença em p.p. */
  taxaRespostaAnterior: number | null;
  /** Mesmo funil, agora por canal — só o Mercado Livre pune reputação por
   *  atraso em pergunta (é um dos fatores do termômetro em `reputacao.service`);
   *  WhatsApp e Instagram atrasados custam experiência, não score. Sem essa
   *  quebra, um WhatsApp lento e um Mercado Livre lento pareciam o mesmo risco. */
  porCanal: AtendimentoPorCanal[];
}

export interface AtendimentoPorCanal {
  canal: string;
  perguntas: number;
  taxaResposta: number | null;
  medianaSegundos: number | null;
  medianaLabel: string | null;
}

interface LinhaAgregada {
  perguntas: number;
  respondidas: number;
  mediana: number | null;
  ate1h: number;
  ate4h: number;
  ate24h: number;
  acima24h: number;
}

function numero(valor: unknown): number {
  const parsed = Number(valor ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 5400 → "1h30". Sem casas decimais: ninguém decide nada com "1,52 horas". */
export function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)}s`;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 24) return resto > 0 ? `${horas}h${String(resto).padStart(2, "0")}` : `${horas}h`;
  const dias = Math.floor(horas / 24);
  const horasResto = horas % 24;
  return horasResto > 0 ? `${dias}d ${horasResto}h` : `${dias}d`;
}

/** Uma consulta, uma janela. Chamada duas vezes (janela atual e anterior) para
 *  o comparativo — mais barato que uma query condicional cheia de CASE.
 *
 *  As datas entram como ISO string com cast explícito, não como `Date`: o
 *  caminho de SQL cru (`db.execute`) entrega os parâmetros direto ao driver,
 *  sem passar pelos conversores de tipo que o query builder usa — e o
 *  postgres-js recusa um objeto Date ali ("must be of type string or Buffer"). */
async function agregarJanela(
  ctx: CrudContext,
  inicio: Date,
  fim: Date,
  brandIds: string[],
): Promise<LinhaAgregada> {
  // Parametrizado como array (`= any($n::uuid[])`) em vez de montar a lista na
  // string: o id vem do cliente, e concatenar valor de usuário dentro de SQL é
  // como se abre buraco de injeção.
  const filtroMarca = brandIds.length > 0
    ? sql`and c.brand_id in (${sql.join(brandIds.map((id) => sql`${id}::uuid`), sql`, `)})`
    : sql``;

  const resultado = await ctx.db.execute(sql`
    with ordenadas as (
      select
        m.conversa_id,
        m.direcao,
        m.criado_em,
        lag(m.direcao) over (partition by m.conversa_id order by m.criado_em, m.id) as direcao_anterior
      from mensagem m
      inner join conversa c on c.id = m.conversa_id
      where m.org_id = ${ctx.orgId}
        and m.criado_em >= ${inicio.toISOString()}::timestamptz
        and m.criado_em <= ${fim.toISOString()}::timestamptz
        ${filtroMarca}
    ),
    perguntas as (
      select conversa_id, criado_em
      from ordenadas
      where direcao = 'entrada'
        and (direcao_anterior is null or direcao_anterior = 'saida')
    ),
    pares as (
      select
        extract(epoch from (
          (select min(o.criado_em) from ordenadas o
            where o.conversa_id = p.conversa_id
              and o.direcao = 'saida'
              and o.criado_em > p.criado_em) - p.criado_em
        )) as espera
      from perguntas p
    )
    select
      count(*)::int as perguntas,
      count(espera)::int as respondidas,
      percentile_cont(0.5) within group (order by espera) as mediana,
      count(*) filter (where espera <= 3600)::int as ate1h,
      count(*) filter (where espera > 3600 and espera <= 14400)::int as ate4h,
      count(*) filter (where espera > 14400 and espera <= 86400)::int as ate24h,
      count(*) filter (where espera > 86400)::int as acima24h
    from pares
  `);

  // postgres-js devolve o array de linhas direto; drizzle às vezes embrulha em
  // { rows }. Aceitar os dois evita quebrar se o driver mudar por baixo.
  const linhas = (Array.isArray(resultado) ? resultado : (resultado as { rows?: unknown[] }).rows) ?? [];
  const linha = (linhas[0] ?? {}) as Record<string, unknown>;

  return {
    perguntas: numero(linha.perguntas),
    respondidas: numero(linha.respondidas),
    mediana: linha.mediana === null || linha.mediana === undefined ? null : numero(linha.mediana),
    ate1h: numero(linha.ate1h),
    ate4h: numero(linha.ate4h),
    ate24h: numero(linha.ate24h),
    acima24h: numero(linha.acima24h),
  };
}

/** Mesmo funil da janela atual, mas quebrado por `channel_account.tipo`. Uma
 *  consulta separada em vez de enfiar `group by` na de cima: a query de cima
 *  já compara duas janelas (atual/anterior) e devolve uma linha; misturar a
 *  quebra por canal ali forçaria repetir toda a lógica de pares por canal
 *  dentro da mesma CTE, tornando as duas ilegíveis. */
async function agregarPorCanal(
  ctx: CrudContext,
  inicio: Date,
  fim: Date,
  brandIds: string[],
): Promise<AtendimentoPorCanal[]> {
  const filtroMarca = brandIds.length > 0
    ? sql`and c.brand_id in (${sql.join(brandIds.map((id) => sql`${id}::uuid`), sql`, `)})`
    : sql``;

  const resultado = await ctx.db.execute(sql`
    with ordenadas as (
      select
        m.conversa_id,
        m.direcao,
        m.criado_em,
        ca.tipo as canal,
        lag(m.direcao) over (partition by m.conversa_id order by m.criado_em, m.id) as direcao_anterior
      from mensagem m
      inner join conversa c on c.id = m.conversa_id
      inner join channel_account ca on ca.id = c.channel_account_id
      where m.org_id = ${ctx.orgId}
        and m.criado_em >= ${inicio.toISOString()}::timestamptz
        and m.criado_em <= ${fim.toISOString()}::timestamptz
        ${filtroMarca}
    ),
    perguntas as (
      select conversa_id, canal, criado_em
      from ordenadas
      where direcao = 'entrada'
        and (direcao_anterior is null or direcao_anterior = 'saida')
    ),
    pares as (
      select
        p.canal,
        extract(epoch from (
          (select min(o.criado_em) from ordenadas o
            where o.conversa_id = p.conversa_id
              and o.direcao = 'saida'
              and o.criado_em > p.criado_em) - p.criado_em
        )) as espera
      from perguntas p
    )
    select
      canal,
      count(*)::int as perguntas,
      count(espera)::int as respondidas,
      percentile_cont(0.5) within group (order by espera) as mediana
    from pares
    group by canal
    order by count(*) desc
  `);

  const linhas = (Array.isArray(resultado) ? resultado : (resultado as { rows?: unknown[] }).rows) ?? [];

  return (linhas as Array<Record<string, unknown>>).map((linha) => {
    const perguntas = numero(linha.perguntas);
    const respondidas = numero(linha.respondidas);
    const mediana = linha.mediana === null || linha.mediana === undefined ? null : numero(linha.mediana);
    return {
      canal: String(linha.canal),
      perguntas,
      taxaResposta: perguntas > 0 ? Math.round((respondidas / perguntas) * 1000) / 10 : null,
      medianaSegundos: mediana,
      medianaLabel: mediana === null ? null : formatarDuracao(mediana),
    };
  });
}

export async function obterAtendimento(
  ctx: CrudContext,
  opcoes: {
    inicio: Date;
    fim: Date;
    brandIds?: string[];
    /** `saude-loja.service` chama isto uma vez por marca só para ler
     *  `taxaResposta`/`medianaSegundos` do pilar — nunca olha `porCanal`.
     *  Sem este interruptor, cada marca rodaria a quebra por canal à toa:
     *  N marcas, N consultas extras cujo resultado ninguém lê. */
    incluirPorCanal?: boolean;
  },
): Promise<AtendimentoResumo> {
  const brandIds = (opcoes.brandIds ?? []).filter(Boolean);
  const incluirPorCanal = opcoes.incluirPorCanal ?? true;
  const duracaoMs = Math.max(opcoes.fim.getTime() - opcoes.inicio.getTime(), 86_400_000);
  const inicioAnterior = new Date(opcoes.inicio.getTime() - duracaoMs);

  const [atual, anterior, porCanal] = await Promise.all([
    agregarJanela(ctx, opcoes.inicio, opcoes.fim, brandIds),
    agregarJanela(ctx, inicioAnterior, opcoes.inicio, brandIds),
    incluirPorCanal ? agregarPorCanal(ctx, opcoes.inicio, opcoes.fim, brandIds) : Promise.resolve([]),
  ]);

  const semResposta = Math.max(atual.perguntas - atual.respondidas, 0);
  const contagens: Record<ChaveFaixaSla, number> = {
    ate1h: atual.ate1h,
    ate4h: atual.ate4h,
    ate24h: atual.ate24h,
    acima24h: atual.acima24h,
    semResposta,
  };

  const faixas: FaixaAtendimento[] = FAIXAS_SLA.map((faixa) => ({
    chave: faixa.chave,
    label: faixa.label,
    cor: faixa.cor,
    quantidade: contagens[faixa.chave],
    participacao: atual.perguntas > 0
      ? Math.round((contagens[faixa.chave] / atual.perguntas) * 1000) / 10
      : 0,
  }));

  const taxaResposta = atual.perguntas > 0
    ? Math.round((atual.respondidas / atual.perguntas) * 1000) / 10
    : null;
  const taxaAnterior = anterior.perguntas > 0
    ? Math.round((anterior.respondidas / anterior.perguntas) * 1000) / 10
    : null;

  return {
    perguntas: atual.perguntas,
    respondidas: atual.respondidas,
    taxaResposta,
    medianaSegundos: atual.mediana,
    medianaLabel: atual.mediana === null ? null : formatarDuracao(atual.mediana),
    faixas,
    variacaoTaxaResposta: taxaResposta !== null && taxaAnterior !== null
      ? Math.round((taxaResposta - taxaAnterior) * 10) / 10
      : null,
    taxaRespostaAnterior: taxaAnterior,
    porCanal,
  };
}
