/** Conferência financeira de um pedido — a somatória dos elementos contra o
 *  valor bruto que a API dona daquele número informou.
 *
 *  O problema: cada canal mede o "bruto" de um jeito e expõe um conjunto
 *  diferente de componentes. O Mercado Livre dá `order.total_amount` (só
 *  produtos); a Shopee dá `buyer_total_amount` (com frete, taxas e menos
 *  voucher) e ainda o repasse real (`escrow_amount`); o TikTok Shop hoje só
 *  entrega total e frete. Esta camada é pura: recebe o pedido já lido do banco,
 *  decompõe em centavos e classifica. Quem re-busca na API e regrava é o
 *  serviço de aplicação — aqui não há I/O.
 *
 *  A regra do líquido continua sendo a de [[liquido-pedido.ts]]: o repasse do
 *  canal manda. Na Shopee, o demonstrativo oficial pode conter vouchers,
 *  reversões e ajustes que não possuem uma coluna equivalente no CRM; por
 *  isso não se inventa divergência tentando reconstruir o escrow parcial. */

import { liquidoFoiInformado } from "./liquido-pedido";

export type CanalConferencia = "mercadolivre" | "shopee" | "tiktokshop";

const CANAIS_CONFERENCIA: readonly CanalConferencia[] = ["mercadolivre", "shopee", "tiktokshop"];

export function ehCanalConferencia(valor: string): valor is CanalConferencia {
  return (CANAIS_CONFERENCIA as readonly string[]).includes(valor);
}

export interface ItemConferencia {
  precoUnitario: string | number;
  quantidade: number;
  /** Comissão da linha (`sale_fee` do ML, rateio do escrow da Shopee). */
  taxaMarketplace?: string | number | null;
}

export interface PedidoConferencia {
  canal: string;
  /** `pedido.total` — o que cada canal grava aqui muda de significado (ver ESPEC_CANAL). */
  total: string | number | null;
  frete?: string | number | null;
  desconto?: string | number | null;
  acrescimo?: string | number | null;
  /** `pedido.valor_liquido` — repasse informado pelo canal (escrow da Shopee). */
  valorLiquido?: string | number | null;
  /** `dados_origem.financeiroInformado` — o canal chegou a liberar o financeiro? */
  financeiroInformado?: boolean;
  itens: ItemConferencia[];
  /** Idade do pedido em dias (agora − criado_em) — decide se um repasse ausente
   *  é "ainda não liberado" ou "sumiu". */
  idadeDias: number;
}

export type ClassificacaoConferencia =
  | "ok"
  | "divergente_bruto"
  | "aguardando_repasse"
  | "sem_repasse"
  | "residuo_liquido_atipico"
  | "nao_aplicavel";

/** Classificações em que vale re-buscar na API e regravar. */
export const CLASSIFICACOES_PARA_RESOLVER: readonly ClassificacaoConferencia[] = [
  "divergente_bruto",
  "aguardando_repasse",
  "sem_repasse",
  "residuo_liquido_atipico",
];

export function precisaResolver(classificacao: ClassificacaoConferencia): boolean {
  return CLASSIFICACOES_PARA_RESOLVER.includes(classificacao);
}

export interface DecomposicaoPedido {
  canal: CanalConferencia | "outro";
  brutoInformadoCentavos: number;
  somaComponentesCentavos: number;
  /** bruto − soma. Positivo: o canal cobrou mais do que a soma dos elementos. */
  residuoBrutoCentavos: number;
  liquidoInformadoCentavos: number | null;
  liquidoReconstruidoCentavos: number | null;
  /** líquido informado − líquido reconstruído. Na Shopee, ≈ subsídio de frete. */
  residuoLiquidoCentavos: number | null;
  classificacao: ClassificacaoConferencia;
  /** Frase curta para o log. */
  detalhe: string;
}

/** Converte reais (string ou number, possivelmente nulo) para centavos inteiros.
 *  Mesmo arredondamento de `dinheiroApi` no provider da Shopee. */
export function emCentavos(valor: string | number | null | undefined): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? Math.round((numero + Number.EPSILON) * 100) : 0;
}

export function emReais(centavos: number): number {
  return Math.round(centavos) / 100;
}

const somaItens = (p: PedidoConferencia): number =>
  p.itens.reduce((total, item) => total + emCentavos(item.precoUnitario) * item.quantidade, 0);

const somaTaxas = (p: PedidoConferencia): number =>
  p.itens.reduce((total, item) => total + emCentavos(item.taxaMarketplace), 0);

interface EspecCanal {
  /** Como somar os elementos que devem reconstruir o `total` deste canal. */
  somaComponentes: (p: PedidoConferencia) => number;
  /** Tolerância do resíduo do bruto, em centavos. `null` = canal sem regra de
   *  conferência de bruto (dados insuficientes hoje). */
  toleranciaBrutoCentavos: number | null;
  /** O canal expõe repasse real e um pedido concluído deveria tê-lo. */
  exigeRepasse: boolean;
  /** Dias de carência antes de tratar repasse ausente como problema. */
  diasGraciaRepasse: number;
  /** Vale conferir `valor_liquido` contra a reconstrução `bruto − taxas − frete`. */
  confereLiquido: boolean;
  /** Banda do resíduo do líquido — na Shopee o subsídio de frete é legítimo e
   *  pode ser grande, então a banda é relativa. */
  toleranciaLiquidoCentavos: (brutoCentavos: number) => number;
}

export const ESPEC_CANAL: Record<CanalConferencia, EspecCanal> = {
  // `pedido.total` = `order.total_amount` = soma dos itens, sem frete nem juros.
  // Frete/desconto/acréscimo existem no schema mas NÃO entram nesse total —
  // conferir é item a item. ML não expõe repasse: o líquido segue estimado.
  mercadolivre: {
    somaComponentes: somaItens,
    toleranciaBrutoCentavos: 2,
    exigeRepasse: false,
    diasGraciaRepasse: 0,
    confereLiquido: false,
    toleranciaLiquidoCentavos: () => 0,
  },
  // `pedido.total` e `pedido.valor_liquido` vêm do demonstrativo oficial.
  // A API não oferece uma decomposição universal que reconstrua ambos em
  // todos os estados do pedido (cancelamento, reversa, subsídio e campanha).
  shopee: {
    somaComponentes: (p) => somaItens(p) + emCentavos(p.frete) + emCentavos(p.acrescimo) - emCentavos(p.desconto),
    toleranciaBrutoCentavos: 2,
    exigeRepasse: true,
    diasGraciaRepasse: 15,
    confereLiquido: true,
    toleranciaLiquidoCentavos: (bruto) => Math.max(2000, Math.round(Math.abs(bruto) * 0.15)),
  },
  // `pedido.total` = `order.payment.total_amount`. `itens[].precoUnitario`
  // vem de `original_price` (preço cheio, não o já descontado `sale_price`),
  // então o desconto de plataforma/vendedor precisa ser subtraído aqui — sem
  // isso a soma bateria só em pedido sem promoção. Fórmula validada contra
  // pedido real das três marcas (03/09/2026), inclusive multi-item e
  // cancelado: 39,9 + 0 (frete) + 6,72 (acréscimo) − 1,36 (desconto) = 45,26.
  //
  // `confereLiquido` continua falso: o repasse líquido do TikTok não vem no
  // pedido, só num endpoint de settlement por pedido — sem versão em lote — e
  // só existe depois que o pedido liquida (dias após a venda). Buscá-lo pra
  // TODO pedido no volume da WUWU (centenas por mês) dobraria as chamadas de
  // detalhe da sincronização. Ligar isto é decisão de custo, não só de
  // código — ver conversa de 03/09/2026.
  tiktokshop: {
    somaComponentes: (p) => somaItens(p) + emCentavos(p.frete) + emCentavos(p.acrescimo) - emCentavos(p.desconto),
    toleranciaBrutoCentavos: 2,
    exigeRepasse: false,
    diasGraciaRepasse: 0,
    confereLiquido: false,
    toleranciaLiquidoCentavos: () => 0,
  },
};

function real(centavos: number): string {
  return emReais(centavos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function decomporPedido(p: PedidoConferencia): DecomposicaoPedido {
  const vazio = {
    brutoInformadoCentavos: emCentavos(p.total),
    somaComponentesCentavos: 0,
    residuoBrutoCentavos: 0,
    liquidoInformadoCentavos: null,
    liquidoReconstruidoCentavos: null,
    residuoLiquidoCentavos: null,
  } as const;

  if (!ehCanalConferencia(p.canal)) {
    return { ...vazio, canal: "outro", classificacao: "nao_aplicavel", detalhe: `Canal "${p.canal}" sem regra de conferência.` };
  }

  const canal = p.canal;
  const espec = ESPEC_CANAL[canal];
  const bruto = emCentavos(p.total);
  const soma = espec.somaComponentes(p);
  const residuoBruto = bruto - soma;

  const temLiquido = liquidoFoiInformado(p.valorLiquido) && (p.financeiroInformado ?? true);
  const liquidoInformado = temLiquido ? emCentavos(p.valorLiquido) : null;
  const liquidoReconstruido = espec.confereLiquido ? bruto - somaTaxas(p) - emCentavos(p.frete) : null;
  const residuoLiquido = liquidoInformado != null && liquidoReconstruido != null
    ? liquidoInformado - liquidoReconstruido
    : null;

  const base: DecomposicaoPedido = {
    canal,
    brutoInformadoCentavos: bruto,
    somaComponentesCentavos: soma,
    residuoBrutoCentavos: residuoBruto,
    liquidoInformadoCentavos: liquidoInformado,
    liquidoReconstruidoCentavos: liquidoReconstruido,
    residuoLiquidoCentavos: residuoLiquido,
    classificacao: "ok",
    detalhe: "",
  };

  if (espec.exigeRepasse && !temLiquido) {
    const aguardando = p.idadeDias <= espec.diasGraciaRepasse;
    return {
      ...base,
      classificacao: aguardando ? "aguardando_repasse" : "sem_repasse",
      detalhe: aguardando
        ? `Repasse ainda não liberado (pedido com ${Math.floor(p.idadeDias)} dia(s), carência de ${espec.diasGraciaRepasse}).`
        : `Repasse ausente ${Math.floor(p.idadeDias)} dias após a compra — deveria ter sido liberado.`,
    };
  }

  if (canal === "shopee") {
    return {
      ...base,
      classificacao: "ok",
      detalhe: "Bruto e repasse preservados do demonstrativo oficial da Shopee; composição parcial não usada como divergência.",
    };
  }

  if (espec.toleranciaBrutoCentavos == null) {
    return { ...base, classificacao: "nao_aplicavel", detalhe: "Canal ainda não decompõe o financeiro; conferência indisponível." };
  }

  if (Math.abs(residuoBruto) > espec.toleranciaBrutoCentavos) {
    return {
      ...base,
      classificacao: "divergente_bruto",
      detalhe: `Bruto ${real(bruto)} ≠ soma dos elementos ${real(soma)} (resíduo ${real(residuoBruto)}).`,
    };
  }

  if (
    espec.confereLiquido
    && residuoLiquido != null
    && Math.abs(residuoLiquido) > espec.toleranciaLiquidoCentavos(bruto)
  ) {
    return {
      ...base,
      classificacao: "residuo_liquido_atipico",
      detalhe: `Repasse ${real(liquidoInformado ?? 0)} destoa da reconstrução ${real(liquidoReconstruido ?? 0)} (resíduo ${real(residuoLiquido)}).`,
    };
  }

  return { ...base, classificacao: "ok", detalhe: `Soma dos elementos confere com o bruto (resíduo ${real(residuoBruto)}).` };
}
