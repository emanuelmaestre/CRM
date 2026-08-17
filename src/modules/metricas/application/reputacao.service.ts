import { and, eq, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";

/** A chamada ao ML por marca é o gargalo real do card Saúde da loja/Termômetro
 *  — todo carregamento do mosaico batia de novo, para cada marca, na API. O
 *  termômetro não pula de faixa a cada segundo, então 90s de cache por marca
 *  cortam a espera sem servir dado velho de verdade. */
export const REPUTACAO_CACHE_TAG = "reputacao-mercadolivre";

async function obterReputacaoDaMarca(orgId: string, slug: string) {
  const provider = await criarMLProvider(slug as Parameters<typeof criarMLProvider>[0]);
  return provider.obterReputacao();
}

const obterReputacaoDaMarcaComCache = unstable_cache(
  obterReputacaoDaMarca,
  ["reputacao-marca"],
  { revalidate: 90, tags: [REPUTACAO_CACHE_TAG] },
);

/* ── Termômetro do Mercado Livre ─────────────────────────────────
   O ML devolve o nível como string ("5_green"). Traduzimos aqui para
   uma posição de 1 a 5 e um rótulo em português, porque "5_green" não
   é coisa que se mostre a um lojista. */

export type FaixaTermometro = 1 | 2 | 3 | 4 | 5;

interface FaixaConfig {
  posicao: FaixaTermometro;
  label: string;
  cor: string;
}

/** `cor` aponta para a rampa ordinal do design system (ver globals.css) em
 *  vez de carregar hex fixo: assim o termômetro segue legível nos dois temas,
 *  e as cinco faixas param de ser uma terceira cópia da mesma escala. */
const TERMOMETRO: Record<string, FaixaConfig> = {
  "1_red": { posicao: 1, label: "Vermelho", cor: "var(--escala-1)" },
  "2_orange": { posicao: 2, label: "Laranja", cor: "var(--escala-2)" },
  "3_yellow": { posicao: 3, label: "Amarelo", cor: "var(--escala-3)" },
  "4_light_green": { posicao: 4, label: "Verde-claro", cor: "var(--escala-4)" },
  "5_green": { posicao: 5, label: "Verde", cor: "var(--escala-5)" },
};

/** Selo de Mercado Líder. O ML manda em inglês; o vendedor lê em português. */
const MERCADO_LIDER: Record<string, string> = {
  silver: "Mercado Líder",
  gold: "Mercado Líder Gold",
  platinum: "Mercado Líder Platinum",
};

/* ── Limites de cada taxa ────────────────────────────────────────
   O ML não publica um número único de corte, mas o termômetro cai
   quando a reclamação passa de ~2%, o cancelamento de ~2% e o atraso
   de ~15% (parâmetros de "Reputação" do próprio painel). Ficam
   nomeados aqui para serem ajustáveis sem caçar mágica no meio da UI. */
export const LIMITE_TAXA = {
  reclamacao: 2,
  cancelamento: 2,
  atrasoEnvio: 15,
} as const;

export type ChaveTaxa = keyof typeof LIMITE_TAXA;

export interface TaxaReputacao {
  chave: ChaveTaxa;
  label: string;
  /** Percentual 0–100. Null quando a conta ainda não tem histórico no período. */
  valor: number | null;
  limite: number;
  /** Quantos casos, em número absoluto, no período que o ML considerou. */
  ocorrencias: number | null;
  /** Passou do teto — é o que derruba o termômetro. */
  estourado: boolean;
}

export interface ReputacaoMarca {
  brandId: string;
  marca: string;
  marcaLabel: string;
  nickname: string | null;
  /** 1 (vermelho) a 5 (verde). Null quando o vendedor ainda não tem termômetro. */
  faixa: FaixaTermometro | null;
  faixaLabel: string | null;
  faixaCor: string | null;
  seloMercadoLider: string | null;
  vendasConcluidas: number | null;
  periodoMetricas: string | null;
  taxas: TaxaReputacao[];
  avaliacaoPositiva: number | null;
  avaliacaoNeutra: number | null;
  avaliacaoNegativa: number | null;
}

export interface ReputacaoResultado {
  marcas: ReputacaoMarca[];
  /** Marcas cuja consulta ao ML falhou — a lista fica parcial e a UI diz isso. */
  marcasComFalha: string[];
  /** Nenhuma conta conectada: não é "reputação zero", é "não dá para saber". */
  semContaConectada: boolean;
}

/** Conta que existe no cadastro mas não está com status "conectado" — motivo
 *  bem diferente de "nunca foi conectada": aqui já funcionou, e algo quebrou
 *  (token expirado, revogado pelo vendedor no próprio ML, etc.). Sem isto
 *  exposto, a marca simplesmente some da tela de Reputação sem explicação —
 *  achado real de auditoria (ver reputacao-card.tsx). */
export interface ContaDesconectada {
  brandId: string;
  marcaLabel: string;
  status: "degradado" | "desconectado";
  ultimoErro: string | null;
  ultimaVerificacao: string | null;
}

export async function obterContasDesconectadas(ctx: CrudContext): Promise<ContaDesconectada[]> {
  const contas = await ctx.db
    .select({
      brandId: channelAccount.brandId,
      slug: brand.slug,
      nome: brand.name,
      status: channelAccount.status,
      ultimoErro: channelAccount.ultimoErro,
      ultimaVerificacao: channelAccount.ultimaVerificacao,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.tipo, "mercadolivre"),
      eq(brand.active, true),
      inArray(channelAccount.status, ["degradado", "desconectado"]),
    ));

  return contas.map((conta) => ({
    brandId: conta.brandId,
    marcaLabel: (isBrandSlug(conta.slug) ? getBrandConfig(conta.slug)?.label : null) ?? conta.nome,
    status: conta.status as "degradado" | "desconectado",
    ultimoErro: conta.ultimoErro,
    ultimaVerificacao: conta.ultimaVerificacao ? conta.ultimaVerificacao.toISOString() : null,
  }));
}

const TAXA_LABEL: Record<ChaveTaxa, string> = {
  reclamacao: "Reclamações",
  cancelamento: "Cancelamentos",
  atrasoEnvio: "Atrasos no envio",
};

function montarTaxa(
  chave: ChaveTaxa,
  valor: number | null,
  ocorrencias: number | null,
): TaxaReputacao {
  return {
    chave,
    label: TAXA_LABEL[chave],
    valor,
    limite: LIMITE_TAXA[chave],
    ocorrencias,
    estourado: valor !== null && valor > LIMITE_TAXA[chave],
  };
}

/** Marcas com conta do Mercado Livre conectada. Compartilhado com o serviço de
 *  reclamações em espírito, mas devolvendo o brandId — o painel filtra por id,
 *  não por slug. */
async function marcasConectadas(ctx: CrudContext, channelAccountId?: string) {
  const condicoes = [
    eq(channelAccount.orgId, ctx.orgId),
    eq(channelAccount.tipo, "mercadolivre"),
    eq(channelAccount.status, "conectado"),
    eq(brand.active, true),
  ];
  if (channelAccountId) condicoes.push(eq(channelAccount.id, channelAccountId));

  const contas = await ctx.db
    .select({ brandId: channelAccount.brandId, slug: brand.slug })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(...condicoes));

  const porSlug = new Map<string, string>();
  for (const conta of contas) {
    if (isBrandSlug(conta.slug) && !porSlug.has(conta.slug)) porSlug.set(conta.slug, conta.brandId);
  }
  return [...porSlug.entries()].map(([slug, brandId]) => ({ slug, brandId }));
}

export async function obterReputacao(
  ctx: CrudContext,
  opcoes: { channelAccountId?: string; ignorarCache?: boolean } = {},
): Promise<ReputacaoResultado> {
  const marcas = await marcasConectadas(ctx, opcoes.channelAccountId);
  if (marcas.length === 0) {
    return { marcas: [], marcasComFalha: [], semContaConectada: true };
  }

  // Uma marca fora do ar não pode derrubar as outras: allSettled em vez de all,
  // e quem falhou vira aviso na tela em vez de erro na página inteira.
  const buscarReputacao = opcoes.ignorarCache ? obterReputacaoDaMarca : obterReputacaoDaMarcaComCache;
  const resultados = await Promise.allSettled(
    marcas.map(({ slug }) => buscarReputacao(ctx.orgId, slug)),
  );

  const marcasComFalha: string[] = [];
  const lista: ReputacaoMarca[] = [];

  resultados.forEach((resultado, indice) => {
    const { slug, brandId } = marcas[indice];
    const label = getBrandConfig(slug)?.label ?? slug;
    if (resultado.status === "rejected") {
      marcasComFalha.push(label);
      return;
    }
    const bruto = resultado.value;
    const faixa = bruto.nivelId ? TERMOMETRO[bruto.nivelId] ?? null : null;
    lista.push({
      brandId,
      marca: slug,
      marcaLabel: label,
      nickname: bruto.nickname,
      faixa: faixa?.posicao ?? null,
      faixaLabel: faixa?.label ?? null,
      faixaCor: faixa?.cor ?? null,
      seloMercadoLider: bruto.statusMercadoLider
        ? MERCADO_LIDER[bruto.statusMercadoLider] ?? bruto.statusMercadoLider
        : null,
      vendasConcluidas: bruto.vendasConcluidas,
      periodoMetricas: bruto.periodoMetricas,
      taxas: [
        montarTaxa("reclamacao", bruto.taxaReclamacao, bruto.reclamacoesPeriodo),
        montarTaxa("cancelamento", bruto.taxaCancelamento, bruto.cancelamentosPeriodo),
        montarTaxa("atrasoEnvio", bruto.taxaAtrasoEnvio, bruto.atrasosPeriodo),
      ],
      avaliacaoPositiva: bruto.avaliacaoPositiva,
      avaliacaoNeutra: bruto.avaliacaoNeutra,
      avaliacaoNegativa: bruto.avaliacaoNegativa,
    });
  });

  // Pior primeiro: quem está no vermelho é quem precisa ser olhado hoje.
  lista.sort((a, b) => (a.faixa ?? 9) - (b.faixa ?? 9) || a.marcaLabel.localeCompare(b.marcaLabel));

  return { marcas: lista, marcasComFalha, semContaConectada: false };
}
