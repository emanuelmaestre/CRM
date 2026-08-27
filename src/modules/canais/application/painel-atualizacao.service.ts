import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import {
  CAMPOS_MODULO_SINCRONIZACAO,
  INTERVALO_MINIMO_VERIFICACAO_MS,
  MODULOS_SINCRONIZACAO,
  progressoDoModulo,
  resultadoOmitido,
  type ModuloSincronizacao,
  type StatusModuloSincronizacao,
} from "../domain/sincronizacao-progresso";
import {
  maiorVersao,
  type FonteVersao,
  type VersoesPorFonte,
} from "../domain/versao-fontes";

export const TELAS_ATUALIZAVEIS = [
  "vendas",
  "avaliacoes",
  "estoque",
  "metricas",
  "anuncios",
  "configuracoes",
  "clientes",
  "importacao",
  "auditoria",
] as const;

export type TelaAtualizavel = (typeof TELAS_ATUALIZAVEIS)[number];

export {
  FONTES_VERSAO,
  type FonteVersao,
  type VersoesPorFonte,
} from "../domain/versao-fontes";

/** Quais fontes cada tela precisa acompanhar. Só estas são consultadas. */
export const FONTES_POR_TELA: Record<TelaAtualizavel, readonly FonteVersao[]> = {
  vendas: ["pedidos"],
  avaliacoes: ["avaliacoes"],
  estoque: ["estoque"],
  metricas: ["pedidos", "estoque", "avaliacoes", "anuncios", "reputacao"],
  anuncios: ["anuncios"],
  configuracoes: ["sincronizacao"],
  clientes: ["clientes"],
  importacao: ["importacao"],
  auditoria: ["auditoria"],
};

/** O que cada tela deixa a pessoa mandar buscar no canal.
 *
 *  Tem que cobrir tudo que a tela mostra — ou seja, espelhar
 *  `FONTES_POR_TELA` acima. Métricas ficava com 3 módulos enquanto lia 5
 *  fontes: os cards de estoque ("Estoque parado", "Repor em breve") e o ROAS
 *  de Publicações apareciam com dado velho e sem nenhum botão ali para
 *  renovar — a pessoa tinha que sair para Estoque ou Publicidade e voltar. */
export const MODULOS_EXTERNOS_POR_TELA: Record<TelaAtualizavel, readonly ModuloSincronizacao[]> = {
  vendas: ["pedidos"],
  avaliacoes: ["avaliacoes"],
  estoque: ["catalogo"],
  metricas: ["pedidos", "catalogo", "avaliacoes", "anuncios", "reputacao"],
  anuncios: ["anuncios"],
  configuracoes: MODULOS_SINCRONIZACAO,
  clientes: ["pedidos"],
  importacao: [],
  auditoria: [],
};

export { INTERVALO_MINIMO_VERIFICACAO_MS } from "../domain/sincronizacao-progresso";

/** Quantos itens ficaram de fora e por quê, lendo os dois formatos que os
 *  módulos gravam em `*_resultado`. Devolve zero e lista vazia quando não há
 *  nada de anormal — é isso que mantém a faixa de pendências fora da tela nas
 *  sincronizações saudáveis. */
export function contagemDePendencia(detalhe: Record<string, unknown> | null): { ignorados: number; motivos: string[] } {
  const motivos = Array.isArray(detalhe?.motivos)
    ? detalhe.motivos.filter((item): item is string => typeof item === "string")
    : [];
  // Pedidos: `ignorados` conta o que não entrou, e `motivos` explica.
  if (motivos.length > 0) {
    return { ignorados: typeof detalhe?.ignorados === "number" ? detalhe.ignorados : motivos.length, motivos };
  }
  // Catálogo: `aviso` é a frase pronta; a contagem vem do diagnóstico, nunca
  // de `ignorados` (que ali significa "já estava mapeado").
  if (typeof detalhe?.aviso === "string" && detalhe.aviso.length > 0) {
    const d = detalhe.diagnostico as Record<string, unknown> | undefined;
    const soma = (chave: string) => (typeof d?.[chave] === "number" ? d[chave] as number : 0);
    return {
      ignorados: Math.max(1, soma("variacoesIndisponiveis") + soma("foraDoStatusNormal")),
      motivos: [detalhe.aviso],
    };
  }
  return { ignorados: 0, motivos: [] };
}

const ROTULOS_MODULO: Record<ModuloSincronizacao, string> = {
  catalogo: "Catálogo e estoque",
  pedidos: "Pedidos",
  anuncios: "Anúncios",
  avaliacoes: "Avaliações",
  reputacao: "Reputação",
};

const ROTULOS_CANAL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktokshop: "TikTok Shop",
};

/** Canais que saem pelo proxy de IP fixo — a UI avisa antes de gastar cota. */
const CANAIS_COM_PROXY = new Set(["shopee"]);

/** O driver devolve ora um array, ora `{ rows }`, conforme a versão. Mesmo
 *  destrinchamento já usado nos serviços de Métricas. */
function linhasDe<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado)) return resultado as T[];
  return ((resultado as { rows?: unknown[] })?.rows ?? []) as T[];
}

function iso(valor: Date | string | null | undefined): string | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/* Cada fonte declara de onde tira a sua atualidade. Uma fonte pode ler mais
   de uma tabela (estoque vem de três) — vira mais de uma linha do UNION e o
   maior valor vence. Todas caem em índice composto (org_id, coluna), criados
   na migration 0051: sem eles cada checagem varria as tabelas inteiras
   (2.815 blocos por checagem; com índice, 14). */
function selectsVersao(orgId: string): Record<FonteVersao, readonly SQL[]> {
  const org = sql`${orgId}::uuid`;
  return {
    pedidos: [sql`select 'pedidos' as fonte, max(atualizado_em) as em from pedido where org_id = ${org}`],
    estoque: [
      sql`select 'estoque', max(verificado_em) from estoque_canal_saldo where org_id = ${org}`,
      sql`select 'estoque', max(atualizado_em) from produto where org_id = ${org}`,
      sql`select 'estoque', max(atualizado_em) from produto_canal where org_id = ${org}`,
    ],
    avaliacoes: [
      sql`select 'avaliacoes', max(atualizado_em) from ml_avaliacao_anuncio where org_id = ${org}`,
      sql`select 'avaliacoes', max(atualizado_em) from shopee_avaliacao_anuncio where org_id = ${org}`,
    ],
    anuncios: [sql`select 'anuncios', max(criado_em) from ads_anuncio_snapshot where org_id = ${org}`],
    reputacao: [sql`
      select 'reputacao', max(iniciado_em) from sincronizacao_execucao
      where org_id = ${org} and reputacao_resultado is not null`],
    clientes: [sql`select 'clientes', max(atualizado_em) from cliente where org_id = ${org}`],
    importacao: [sql`select 'importacao', max(criado_em) from import_lote where org_id = ${org}`],
    auditoria: [sql`select 'auditoria', max(criado_em) from audit_log where org_id = ${org}`],
    sincronizacao: [sql`select 'sincronizacao', max(iniciado_em) from sincronizacao_execucao where org_id = ${org}`],
  };
}

/** As versões de todas as fontes da tela em UMA ida ao banco.
 *
 *  Antes eram até seis consultas separadas (Métricas), cada uma ocupando uma
 *  conexão do pool a cada checagem. Um UNION ALL devolve o mesmo em uma
 *  viagem só, e o cabeçalho continua lendo apenas relógio — nunca as linhas,
 *  nunca um marketplace. */
async function versoesDados(ctx: CrudContext, tela: TelaAtualizavel): Promise<VersoesPorFonte> {
  const fontes = FONTES_POR_TELA[tela];
  if (fontes.length === 0) return {};

  const catalogo = selectsVersao(ctx.orgId);
  const partes = fontes.flatMap((fonte) => catalogo[fonte]);
  const resultado = await ctx.db.execute(sql.join(partes, sql` union all `));

  const versoes: VersoesPorFonte = {};
  for (const fonte of fontes) versoes[fonte] = null;
  for (const linha of linhasDe<{ fonte: string; em: Date | string | null }>(resultado)) {
    const fonte = linha.fonte as FonteVersao;
    if (!(fonte in versoes)) continue;
    versoes[fonte] = maiorVersao([versoes[fonte], iso(linha.em)]);
  }
  return versoes;
}

/** Progresso de um módulo reduzido às três chaves que o cálculo usa.
 *
 *  Traz `jsonb_build_object` em vez da coluna inteira porque o payload de
 *  reputação sozinho é maior que todo o resto da linha somado — e o painel
 *  nunca leu nada além destas três chaves. `null` continua `null` para o
 *  cálculo distinguir "sem resultado" de "resultado com progresso zero". */
function resumoResultado(coluna: SQL, campo: string) {
  const bruto = sql.identifier(campo);
  return sql<unknown>`case when ${coluna}.${bruto} is null then null else jsonb_build_object(
    'progresso', ${coluna}.${bruto} -> 'progresso',
    'omitido', ${coluna}.${bruto} -> 'omitido',
    'desativado', ${coluna}.${bruto} -> 'desativado'
  ) end`;
}

type ExecucaoLinha = {
  id: string;
  channelAccountId: string;
  iniciadoEm: Date;
  finalizadoEm: Date | null;
} & Record<string, unknown>;

/** Última execução de cada conta.
 *
 *  Antes: as 60 execuções mais recentes com todas as colunas, para usar só a
 *  primeira de cada conta. Agora o `distinct on` deixa o Postgres devolver
 *  uma linha por conta (índice idx_sincronizacao_org_conta_iniciado). */
async function ultimasExecucoes(ctx: CrudContext): Promise<ExecucaoLinha[]> {
  const tabela = sql`sincronizacao_execucao`;
  const resumos = MODULOS_SINCRONIZACAO.map((modulo) => {
    const campos = CAMPOS_MODULO_SINCRONIZACAO[modulo];
    return sql`
      ${sql.identifier(`${modulo}_status`)} as ${sql.identifier(campos.status)},
      ${sql.identifier(`${modulo}_erro`)} as ${sql.identifier(campos.erro)},
      ${resumoResultado(tabela, `${modulo}_resultado`)} as ${sql.identifier(campos.resultado)}
    `;
  });

  const resultado = await ctx.db.execute(sql`
    select distinct on (channel_account_id)
      id,
      channel_account_id as "channelAccountId",
      iniciado_em as "iniciadoEm",
      finalizado_em as "finalizadoEm",
      ${sql.join(resumos, sql`,`)}
    from ${tabela}
    where org_id = ${ctx.orgId}
    order by channel_account_id, iniciado_em desc
  `);
  return linhasDe<ExecucaoLinha>(resultado);
}

/** Último sucesso e última tentativa por conta/módulo.
 *
 *  É o dado que a pessoa realmente quer do painel — "o estoque da Shopee é
 *  de quando?" — e que a porcentagem sozinha nunca respondeu. Uma agregação
 *  só, não uma consulta por módulo. */
async function atualidadePorConta(ctx: CrudContext) {
  const agregados = MODULOS_SINCRONIZACAO.map((modulo) => sql`
    max(finalizado_em) filter (where ${sql.identifier(`${modulo}_status`)} = 'concluido')
      as ${sql.identifier(`${modulo}_sucesso`)},
    max(iniciado_em) filter (where ${sql.identifier(`${modulo}_status`)} <> 'pendente')
      as ${sql.identifier(`${modulo}_tentativa`)}
  `);

  const resultado = await ctx.db.execute(sql`
    select channel_account_id as "channelAccountId", ${sql.join(agregados, sql`,`)}
    from sincronizacao_execucao
    where org_id = ${ctx.orgId}
    group by channel_account_id
  `);
  return linhasDe<Record<string, string | Date | null>>(resultado);
}

export async function obterPainelAtualizacao(ctx: CrudContext, tela: TelaAtualizavel) {
  const modulosDaTela = MODULOS_EXTERNOS_POR_TELA[tela];

  const [contas, execucoes, sucessos, versoes] = await Promise.all([
    ctx.db
      .select({
        id: channelAccount.id,
        tipo: channelAccount.tipo,
        nome: channelAccount.nome,
        brandId: channelAccount.brandId,
        brandSlug: brand.slug,
        brandLabel: brand.name,
      })
      .from(channelAccount)
      .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, ctx.orgId)))
      .where(and(
        eq(channelAccount.orgId, ctx.orgId),
        eq(channelAccount.status, "conectado"),
        inArray(channelAccount.tipo, ["mercadolivre", "shopee", "tiktokshop"]),
      ))
      .orderBy(brand.name, channelAccount.tipo),
    ultimasExecucoes(ctx),
    atualidadePorConta(ctx),
    versoesDados(ctx, tela),
  ]);

  const execucaoPorConta = new Map(execucoes.map((execucao) => [execucao.channelAccountId, execucao]));
  const sucessoPorConta = new Map(sucessos.map((linha) => [String(linha.channelAccountId), linha]));
  const permitidos = new Set(modulosDaTela);
  const agora = Date.now();

  const contasResultado = contas.map((conta) => {
    const execucao = execucaoPorConta.get(conta.id) ?? null;
    const historico = sucessoPorConta.get(conta.id);

    const modulosDisponiveis = modulosDaTela.filter((modulo) => (
      modulo !== "anuncios" || conta.tipo === "mercadolivre"
    ));

    const modulos = execucao
      ? MODULOS_SINCRONIZACAO.flatMap((modulo) => {
          const campos = CAMPOS_MODULO_SINCRONIZACAO[modulo];
          const resultado = execucao[campos.resultado];
          if (!permitidos.has(modulo) || resultadoOmitido(resultado)) return [];
          const status = execucao[campos.status] as StatusModuloSincronizacao;
          const detalhe = resultado && typeof resultado === "object" ? resultado as Record<string, unknown> : null;
          return [{
            modulo,
            label: ROTULOS_MODULO[modulo],
            status,
            progresso: progressoDoModulo(status, resultado),
            erro: execucao[campos.erro] as string | null,
            // Itens pulados por causa conhecida daquele item — o módulo
            // concluiu, mas não trouxe tudo (ver `pendencias` abaixo).
            //
            // Duas formas de dizer a mesma coisa, porque os módulos gravam
            // diferente: Pedidos emite `ignorados` + `motivos` (um por pedido
            // que não entrou); Catálogo emite `aviso`, uma frase pronta, mais
            // `diagnostico` com os números — e ali `ignorados` NÃO serve de
            // contagem, porque conta anúncio já mapeado (o caso saudável).
            ...contagemDePendencia(detalhe),
          }];
        })
      : [];

    /* Atualidade por módulo: o que o painel mostra em cada linha. Fica fora
       de `modulos` de propósito — aquele só existe enquanto há execução, e a
       idade do dado precisa aparecer mesmo com tudo parado. */
    const atualidade = modulosDisponiveis.map((modulo) => {
      const ultimoSucesso = iso(historico?.[`${modulo}_sucesso`] ?? null);
      const ultimaTentativa = iso(historico?.[`${modulo}_tentativa`] ?? null);
      const esperaAte = ultimaTentativa
        ? new Date(ultimaTentativa).getTime() + INTERVALO_MINIMO_VERIFICACAO_MS
        : 0;
      return {
        modulo,
        label: ROTULOS_MODULO[modulo],
        ultimoSucesso,
        ultimaTentativa,
        // Quantos segundos faltam pro intervalo mínimo. Zero = liberado.
        esperarSegundos: esperaAte > agora ? Math.ceil((esperaAte - agora) / 1000) : 0,
      };
    });

    return {
      id: conta.id,
      canal: conta.tipo,
      canalLabel: ROTULOS_CANAL[conta.tipo] ?? conta.nome,
      usaProxy: CANAIS_COM_PROXY.has(conta.tipo),
      brandId: conta.brandId,
      brandSlug: conta.brandSlug,
      brandLabel: conta.brandLabel,
      modulosDisponiveis,
      atualidade,
      execucao: execucao ? {
        id: execucao.id,
        emAndamento: !execucao.finalizadoEm && modulos.length > 0,
        iniciadoEm: new Date(execucao.iniciadoEm).toISOString(),
        finalizadoEm: iso(execucao.finalizadoEm),
        progresso: modulos.length > 0
          ? Math.round(modulos.reduce((total, item) => total + item.progresso, 0) / modulos.length)
          : 100,
        modulos,
      } : null,
    };
  });

  const ativas = contasResultado.flatMap((conta) => conta.execucao?.emAndamento ? [conta.execucao] : []);
  const progresso = ativas.length > 0
    ? Math.round(ativas.reduce((total, execucao) => total + execucao.progresso, 0) / ativas.length)
    : 100;

  /* Pedidos que o canal entregou mas o CRM não conseguiu ingerir por uma
     causa conhecida daquele pedido — hoje só SKU sem produto na marca
     (anúncio despublicado depois da venda). NÃO é falha do canal e não entra
     em `falhas`: o alerta vermelho de "canal não respondeu" acusava a Shopee
     de algo que ela respondeu certo. Mas também não pode sumir da tela, ou o
     pedido fica de fora sem ninguém saber. Faixa própria, sem alarme. */
  /* Exige `motivos`, não só `ignorados`. "Ignorado" quer dizer coisas
     opostas conforme o módulo: em Pedidos é item que ficou de fora e importa
     avisar; no Catálogo é anúncio JÁ mapeado, que é o estado normal e
     saudável (65 ignorados numa loja de 65 anúncios significa "nada mudou").
     Ler `ignorados` cru anunciaria "65 itens ficaram de fora" em toda
     sincronização bem-sucedida de catálogo. `motivos` só existe quando algo
     de fato falhou. */
  const pendencias = contasResultado.flatMap((conta) => {
    const itens = conta.execucao?.modulos.flatMap((item) => (
      item.status === "concluido" && item.ignorados > 0 && item.motivos.length > 0
        ? [{ label: item.label, ignorados: item.ignorados, motivos: item.motivos }]
        : []
    )) ?? [];
    if (itens.length === 0) return [];
    return [{
      contaId: conta.id,
      canalLabel: conta.canalLabel,
      brandLabel: conta.brandLabel,
      itens,
    }];
  });

  const falhas = contasResultado.flatMap((conta) => {
    const comErro = conta.execucao?.modulos.filter((item) => item.status === "erro") ?? [];
    if (comErro.length === 0) return [];
    /* A idade do dado que continua na tela apesar da falha — é o que a
       mensagem precisa dizer ("exibindo o de 10:38"), em vez de mandar a
       pessoa procurar o motivo em Configurações. */
    const ultimoBom = maiorVersao(
      conta.atualidade
        .filter((item) => comErro.some((falha) => falha.modulo === item.modulo))
        .map((item) => item.ultimoSucesso),
    );
    return [{
      contaId: conta.id,
      canal: conta.canal,
      canalLabel: conta.canalLabel,
      brandLabel: conta.brandLabel,
      modulos: comErro.map((item) => item.label),
      erro: comErro.find((item) => item.erro)?.erro ?? null,
      ultimoDadoBom: ultimoBom,
    }];
  });

  const ultimaConcluida = maiorVersao(
    contasResultado.map((conta) => conta.execucao?.finalizadoEm),
  );

  return {
    tela,
    versoes,
    /** Maior versão entre as fontes da tela — o relógio que o botão mostra.
     *  Quem precisa reagir a uma fonte específica usa `versoes`. */
    versao: maiorVersao(Object.values(versoes)),
    progresso,
    emAndamento: ativas.length > 0,
    ultimaConcluida,
    falhas,
    pendencias,
    podeSincronizar: ctx.perfil === "admin" || ctx.perfil === "gestor",
    modulosDisponiveis: [...permitidos],
    contas: contasResultado,
  };
}

export type PainelAtualizacao = Awaited<ReturnType<typeof obterPainelAtualizacao>>;
