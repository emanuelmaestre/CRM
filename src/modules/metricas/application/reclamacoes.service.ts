import { and, eq, inArray } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { brand, channelAccount, pedido } from "@/shared/lib/db/schema";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import type { MLReclamacaoDestinatario } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { getBrandConfig, isBrandSlug, type BrandSlug } from "@/shared/config/brands";

/** Estágios do pós-venda do Mercado Livre, na ordem em que escalam. */
const ESTAGIO_LABEL: Record<string, string> = {
  none: "Sem estágio",
  claim: "Reclamação",
  recontact: "Recontato",
  dispute: "Mediação",
};

export interface ReclamacaoResumo {
  id: string;
  marca: string;
  marcaLabel: string;
  estagio: string;
  /** Código de motivo do Mercado Livre. Exibido cru: a API não devolve texto legível. */
  motivo: string | null;
  abertaEm: string | null;
  diasAberta: number | null;
  /** Link interno para o pedido, quando o pedido já foi ingerido no CRM. */
  pedidoHref: string | null;
  /** Escalou para mediação — precisa de atenção antes das demais. */
  emMediacao: boolean;
  /** false quando o vendedor já não tem nenhuma ação pendente no Mercado
   *  Livre — na prática resolvida, só falta o ML encerrar o registro. */
  precisaAcao: boolean;
  atualizadaEm: string | null;
}

export interface ReclamacoesResultado {
  itens: ReclamacaoResumo[];
  total: number;
  /** Quantas do total realmente esperam alguma ação nossa — calculado antes
   *  de cortar `itens` para os 8 primeiros, pra não subcontar quando há mais
   *  de 8 casos pendentes. */
  pendentes: number;
  /** Marcas cuja consulta falhou — a lista fica parcial, e a UI precisa dizer isso. */
  marcasComFalha: string[];
  /** Nenhuma conta do Mercado Livre conectada: não é "zero reclamações", é "não dá para saber". */
  semContaConectada: boolean;
}

export async function obterReclamacoesAbertas(
  ctx: CrudContext,
  opcoes: { channelAccountId?: string } = {},
): Promise<ReclamacoesResultado> {
  const condicoes = [
    eq(channelAccount.orgId, ctx.orgId),
    eq(channelAccount.tipo, "mercadolivre"),
    eq(channelAccount.status, "conectado"),
    eq(brand.active, true),
  ];
  if (opcoes.channelAccountId) condicoes.push(eq(channelAccount.id, opcoes.channelAccountId));

  const contas = await ctx.db
    .select({ marca: brand.slug })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(...condicoes));

  const marcas = [...new Set(contas.map((item) => item.marca))].filter(isBrandSlug);
  if (marcas.length === 0) {
    return { itens: [], total: 0, pendentes: 0, marcasComFalha: [], semContaConectada: true };
  }

  const resultados = await Promise.allSettled(
    marcas.map(async (slug) => {
      const provider = await criarMLProvider(slug);
      return { slug, reclamacoes: await provider.listarReclamacoesAbertas() };
    }),
  );

  const marcasComFalha: string[] = [];
  const brutas: Array<{ slug: string; reclamacao: Awaited<ReturnType<
    Awaited<ReturnType<typeof criarMLProvider>>["listarReclamacoesAbertas"]
  >>[number] }> = [];

  resultados.forEach((resultado, index) => {
    if (resultado.status === "fulfilled") {
      for (const reclamacao of resultado.value.reclamacoes) {
        brutas.push({ slug: resultado.value.slug, reclamacao });
      }
    } else {
      marcasComFalha.push(getBrandConfig(marcas[index])?.label ?? marcas[index]);
    }
  });

  // Liga a reclamação ao pedido local quando ele já foi ingerido, para o card
  // poder navegar direto ao pedido em vez de só mostrar um número solto.
  const pedidoExternoIds = [...new Set(
    brutas.map((item) => item.reclamacao.pedidoExternoId).filter((id): id is string => Boolean(id)),
  )];
  const pedidosLocais = pedidoExternoIds.length > 0
    ? await ctx.db
        .select({ id: pedido.id, providerOrderId: pedido.providerOrderId })
        .from(pedido)
        .where(and(eq(pedido.orgId, ctx.orgId), inArray(pedido.providerOrderId, pedidoExternoIds)))
    : [];
  const pedidoPorExterno = new Map(
    pedidosLocais
      .filter((item): item is { id: string; providerOrderId: string } => Boolean(item.providerOrderId))
      .map((item) => [item.providerOrderId, item.id]),
  );

  const agora = Date.now();
  const itens: ReclamacaoResumo[] = brutas
    .map(({ slug, reclamacao }) => {
      const abertaEm = reclamacao.abertaEm ? new Date(reclamacao.abertaEm) : null;
      const valida = abertaEm && !Number.isNaN(abertaEm.getTime()) ? abertaEm : null;
      const pedidoLocalId = reclamacao.pedidoExternoId
        ? pedidoPorExterno.get(reclamacao.pedidoExternoId) ?? null
        : null;
      return {
        id: reclamacao.id,
        marca: slug,
        marcaLabel: getBrandConfig(slug)?.label ?? slug,
        estagio: ESTAGIO_LABEL[reclamacao.estagio ?? "none"] ?? reclamacao.estagio ?? "Reclamação",
        motivo: reclamacao.motivo,
        abertaEm: valida ? valida.toISOString() : null,
        diasAberta: valida ? Math.floor((agora - valida.getTime()) / 86_400_000) : null,
        pedidoHref: pedidoLocalId ? `/vendas/pedidos/${pedidoLocalId}` : null,
        emMediacao: reclamacao.estagio === "dispute",
        precisaAcao: reclamacao.precisaAcao,
        atualizadaEm: reclamacao.atualizadaEm,
      };
    })
    // Quem precisa de ação nossa vem primeiro; dentro desse grupo, mediação
    // primeiro (já escalou) e depois as mais antigas. As já resolvidas (sem
    // ação pendente) ficam por último — não competem por atenção com as que
    // realmente precisam de resposta.
    .sort((a, b) => {
      if (a.precisaAcao !== b.precisaAcao) return a.precisaAcao ? -1 : 1;
      if (a.emMediacao !== b.emMediacao) return a.emMediacao ? -1 : 1;
      return (b.diasAberta ?? 0) - (a.diasAberta ?? 0);
    });

  return {
    itens: itens.slice(0, 8),
    total: itens.length,
    pendentes: itens.filter((item) => item.precisaAcao).length,
    marcasComFalha,
    semContaConectada: false,
  };
}

export interface ReclamacaoMensagem {
  deVendedor: boolean;
  destinatario: string;
  texto: string;
  criadaEm: string | null;
}

/** Reclamação não é persistida localmente — a marca é o que identifica qual
 *  conta do Mercado Livre consultar, tal como já chega em ReclamacaoResumo.marca. */
export async function listarMensagensReclamacao(
  ctx: CrudContext,
  marca: string,
  claimId: string,
): Promise<ReclamacaoMensagem[]> {
  if (!isBrandSlug(marca)) throw new Error("Marca inválida.");
  await confirmarContaConectada(ctx, marca);
  const provider = await criarMLProvider(marca);
  const mensagens = await provider.listarMensagensReclamacao(claimId);
  return mensagens.map((mensagem) => ({
    deVendedor: mensagem.remetente === "respondent",
    destinatario: mensagem.destinatario,
    texto: mensagem.texto,
    criadaEm: mensagem.criadaEm,
  }));
}

export async function responderReclamacao(
  ctx: CrudContext,
  marca: string,
  claimId: string,
  mensagem: string,
  emMediacao: boolean,
): Promise<void> {
  if (process.env.EXTERNAL_SENDS_ENABLED !== "true") {
    throw new Error("Envios externos desabilitados até a liberação de go-live.");
  }
  if (!isBrandSlug(marca)) throw new Error("Marca inválida.");
  await confirmarContaConectada(ctx, marca);
  const provider = await criarMLProvider(marca);
  // O vendedor é sempre "respondent"; o destinatário segue a etapa da
  // reclamação (ver available_actions na documentação oficial do Mercado
  // Livre): em disputa/mediação vai para o mediador, senão para quem reclamou.
  const destinatario: MLReclamacaoDestinatario = emMediacao ? "mediator" : "complainant";
  await provider.responderReclamacao(claimId, mensagem, destinatario);
}

async function confirmarContaConectada(ctx: CrudContext, marca: BrandSlug): Promise<void> {
  const conta = await ctx.db
    .select({ id: channelAccount.id })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.tipo, "mercadolivre"),
      eq(channelAccount.status, "conectado"),
      eq(brand.slug, marca),
      eq(brand.active, true),
    ))
    .then((rows) => rows[0]);
  if (!conta) throw new Error("Conta Mercado Livre não conectada para esta marca.");
}
