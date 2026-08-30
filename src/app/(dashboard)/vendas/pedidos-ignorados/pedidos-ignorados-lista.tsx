"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ChevronDown, CircleSlash, Clock3, Loader2, RotateCw, Undo2,
  PackageSearch, UserRoundX, Bug, HelpCircle, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { isBrandSlug } from "@/shared/config/brands";
import { moeda } from "@/shared/design-system/format";
import { springs, stagger, fadeUp } from "@/shared/design-system/motion-variants";
import { mapearStatusPedido } from "@/modules/canais/domain/order-status";
import pagesConfig from "@/config/pages.json";
import type { ItemPedidoIgnorado, PedidoIgnoradoLinha } from "@/modules/vendas/application/pedidos-ignorados.service";
import { actionDescartarPedidoIgnorado, actionReprocessarFilaAberta, actionReprocessarPedidoIgnorado } from "./actions";

/* ── Onde mora a explicação ───────────────────────────────────────────
   Duas coisas diferentes já foram chamadas de "explicação" nesta tela, e a
   divisão atual é o que sobrou de tentar as duas.

   A REGRA GERAL da causa ("falta o produto do SKU vendido") é igual para as
   quarenta linhas do grupo, então fica uma vez só, no cabeçalho, em uma
   frase. Repeti-la por cartão foi o que inchou a versão antiga.

   O DIAGNÓSTICO do pedido — qual SKU faltou, qual comprador colidiu, se ele
   está cancelado no canal, quantas vezes já foi tentado — muda de linha para
   linha e por isso vive dentro do cartão, sempre aberto. É a resposta à
   pergunta que traz alguém a esta tela ("por que ESTE pedido não entrou?"),
   e nenhuma delas é adivinhável a partir do texto do grupo. */

type Tom = "voce" | "sozinho" | "nosso" | "neutro";

/** Onde a pendência se resolve — o eixo que realmente muda o que a pessoa
 *  faz depois de ler. Sem isso, as quatro causas parecem a mesma coisa:
 *  "deu erro". Com isso, a fila se divide em "eu preciso agir", "vai sair
 *  sozinho" e "não adianta insistir". */
const TONS: Record<Tom, { etiqueta: string; cor: string }> = {
  voce:    { etiqueta: "Depende de você", cor: "var(--warning)" },
  sozinho: { etiqueta: "Sai sozinho",     cor: "var(--info)" },
  nosso:   { etiqueta: "É problema do CRM", cor: "var(--destructive)" },
  neutro:  { etiqueta: "Sem classificação", cor: "var(--muted-foreground)" },
};

type Diagnostico = { motivo: string; resolucao: string };

const NOMES_CANAL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
};

function nomeCanal(canal: string): string {
  return NOMES_CANAL[canal] ?? canal;
}

/** Os SKUs que ESTA linha cita. A pendência guarda os SKUs que derrubaram a
 *  ingestão, mas linhas antigas foram gravadas sem eles — aí os itens do
 *  payload servem, que é a mesma informação por outro caminho. */
function skusDaLinha(linha: PedidoIgnoradoLinha): string[] {
  if (linha.skus.length > 0) return linha.skus;
  return [...new Set(linha.itens.map((item) => item.sku).filter((sku): sku is string => Boolean(sku)))];
}

function listaLegivel(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  if (itens.length === 2) return `${itens[0]} e ${itens[1]}`;
  return `${itens.slice(0, 2).join(", ")} e mais ${itens.length - 2}`;
}

/** Qual campo colidiu, lido do nome do índice único que o banco recusou.
 *  Saber que foi o TELEFONE (e não o e-mail) é o que diz onde procurar o
 *  cadastro conflitante — "cliente duplicado" sozinho não diz. */
function campoDuplicado(linha: PedidoIgnoradoLinha): { rotulo: string; valor: string | null } {
  if (/telefone/i.test(linha.motivo)) return { rotulo: "telefone", valor: linha.compradorTelefone };
  if (/email|e_mail/i.test(linha.motivo)) return { rotulo: "e-mail", valor: null };
  if (/documento|cpf|cnpj/i.test(linha.motivo)) return { rotulo: "documento", valor: null };
  return { rotulo: "cadastro", valor: linha.compradorUsuario };
}

/** O campo que o validador recusou, quando o erro carrega o caminho. */
function campoInvalido(motivo: string): string | null {
  const achado = /"path"\s*:\s*\[\s*"([^"]+)"/.exec(motivo) ?? /path:\s*\[\s*'?"?([\w.]+)/.exec(motivo);
  return achado?.[1] ?? null;
}

/** O erro cru cabe numa frase: o texto inteiro vive em "Ver detalhes". */
function primeiraFrase(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  const corte = limpo.slice(0, 160);
  return corte.length < limpo.length ? `${corte}…` : corte;
}

const CAUSAS: Record<string, {
  rotulo: string;
  icone: LucideIcon;
  tom: Tom;
  /** Uma linha no cabeçalho do grupo: a regra geral da causa. O diagnóstico
   *  de verdade — com o SKU, o comprador, o status deste pedido — mora no
   *  cartão, porque é lá que ele muda de uma linha para a outra. */
  resumo: string;
  diagnostico: (linha: PedidoIgnoradoLinha) => Diagnostico;
}> = {
  sku_sem_produto: {
    rotulo: "SKU sem produto",
    icone: PackageSearch,
    tom: "sozinho",
    resumo: "Falta no CRM o produto do SKU que o pedido vendeu. Costuma entrar sozinho quando o catálogo do canal sincroniza.",
    diagnostico: (linha) => {
      const skus = skusDaLinha(linha);
      const canal = nomeCanal(linha.canal);
      return {
        motivo: skus.length === 0
          ? "O pedido cita um SKU que ainda não existe como produto no CRM. Sem o produto, não há onde pendurar o item vendido, e o pedido inteiro fica de fora."
          : `${skus.length === 1 ? `O SKU ${skus[0]} não existe` : `Os SKUs ${listaLegivel(skus)} não existem`} como produto no CRM. Sem o produto, não há onde pendurar o item vendido, e o pedido inteiro fica de fora.`,
        resolucao: skus.length === 0
          ? `Tente novamente depois da próxima sincronização do catálogo da ${linha.marca}. Se não entrar, abra "Ver detalhes": o erro registrado diz qual SKU faltou.`
          : `Procure ${skus.length === 1 ? skus[0] : "esses SKUs"} nos anúncios da ${linha.marca} no ${canal}. Se ainda estiver lá, a próxima sincronização do catálogo cria o produto e a pendência sai sozinha — "Tentar novamente" antecipa isso. Se o SKU foi renomeado ou apagado no ${canal}, corrija o anúncio primeiro: nenhuma tentativa aqui cria produto que o canal não tem.`,
      };
    },
  },
  cliente_duplicado: {
    rotulo: "Cliente duplicado",
    icone: UserRoundX,
    tom: "voce",
    resumo: "O cadastro do comprador colidiu com um cliente que já existe. Resolve-se aqui dentro, não no painel do canal.",
    diagnostico: (linha) => {
      const campo = campoDuplicado(linha);
      const comprador = linha.compradorNome ?? "O comprador";
      const mascarado = linha.canal === "shopee" && campo.rotulo === "telefone";
      return {
        motivo: `${comprador} chegou com ${campo.rotulo}${campo.valor ? ` ${campo.valor}` : ""} já usado por outro cliente do CRM, e o cadastro foi recusado.${mascarado ? " Na Shopee o telefone vem mascarado, então compradores diferentes chegam com o mesmo valor — não é erro de cadastro seu." : ""}`,
        resolucao: `Abra Clientes e procure por ${campo.valor ?? comprador}: junte os cadastros se for a mesma pessoa, ou separe-os se forem duas. Feito isso, "Tentar novamente" aqui traz o pedido. Mexer no ${nomeCanal(linha.canal)} não muda nada — o conflito é de dado do CRM.`,
      };
    },
  },
  payload_invalido: {
    rotulo: "Formato inesperado",
    icone: Bug,
    tom: "nosso",
    resumo: "O canal mandou o pedido num formato que o CRM não sabe ler. É falha nossa, e não há o que fazer na loja.",
    diagnostico: (linha) => {
      const campo = campoInvalido(linha.motivo);
      const canal = nomeCanal(linha.canal);
      return {
        motivo: campo
          ? `O ${canal} devolveu este pedido com o campo "${campo}" num formato que o CRM não sabe ler. A falha está do nosso lado, não no seu cadastro nem no anúncio.`
          : `O ${canal} devolveu este pedido num formato que o CRM não sabe ler. A falha está do nosso lado, não no seu cadastro nem no anúncio.`,
        resolucao: `Nada a fazer nesta tela — repare que não existe "Tentar novamente" aqui: o pedido guardado é o mesmo e passaria pelo mesmo validador, dando exatamente este erro de novo. Ele sai da fila quando o CRM aprender esse formato; o texto em "Ver detalhes" é o que o desenvolvedor precisa.`,
      };
    },
  },
  desconhecida: {
    rotulo: "Não classificada",
    icone: HelpCircle,
    tom: "neutro",
    resumo: "Falha sem classificação própria — em geral tropeço passageiro de rede ou de limite da API do canal.",
    diagnostico: (linha) => ({
      motivo: `A importação parou em: "${primeiraFrase(linha.motivo)}" — um erro que ainda não tem classificação própria no CRM.`,
      resolucao: `Vale clicar em "Tentar novamente": falhas passageiras (rede fora, limite da API do ${nomeCanal(linha.canal)}) caem aqui e costumam passar na segunda tentativa.`,
    }),
  },
};

/* Ordem dos grupos: pelo que a pessoa pode fazer, não pelo tamanho. O grupo
   que exige ação humana vem primeiro mesmo tendo duas linhas; o que se
   resolve sozinho vem depois mesmo tendo trinta. Ordenar por quantidade
   colocaria no topo justamente o bloco que não pede nada de ninguém. */
const ORDEM_CAUSAS = ["cliente_duplicado", "desconhecida", "sku_sem_produto", "payload_invalido"];

function causaDe(chave: string) {
  return CAUSAS[chave] ?? CAUSAS.desconhecida;
}

/** O que aconteceu com ESTE pedido e o que fazer com ELE.
 *
 *  Parte do texto da causa e deixa o estado da própria linha sobrescrever o
 *  conselho, porque o estado manda mais que a causa: um pedido cancelado no
 *  canal não vira receita nem se entrar (recuperá-lo é trabalho jogado fora),
 *  e um pedido já descartado não pede ação nenhuma até voltar para a fila.
 *  Sem isso, a tela mandaria caçar SKU de pedido cancelado. */
function diagnosticoDe(linha: PedidoIgnoradoLinha): Diagnostico {
  const base = causaDe(linha.causa).diagnostico(linha);
  const cancelado = linha.statusCanal !== null && mapearStatusPedido(linha.statusCanal) === "cancelado";

  if (linha.descartadoEm !== null) {
    return {
      ...base,
      resolucao: `Marcado como não recuperável em ${dataCurta(linha.descartadoEm)}: não conta mais na fila e ninguém precisa fazer nada. Para voltar a tentar, use "Devolver à fila".`,
    };
  }
  if (cancelado) {
    return {
      ...base,
      resolucao: `Este pedido está cancelado no ${nomeCanal(linha.canal)}: mesmo que entre, não vira receita. Recuperá-lo não muda faturamento nenhum — o caminho aqui é "Não recuperável", que tira da fila sem apagar o registro.`,
    };
  }
  if (linha.tentativas >= 3 && linha.reprocessavel) {
    return {
      ...base,
      resolucao: `${base.resolucao} Já são ${linha.tentativas} tentativas com o mesmo resultado — insistir sem mudar nada fora desta tela não deve bastar.`,
    };
  }
  return base;
}

function diasParado(desde: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000));
}

function dataCurta(valor: string | Date | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Uma linha da fila. Curta de propósito: tudo que ela NÃO precisa dizer
 *  (o que aconteceu, o que fazer) já foi dito uma vez no cabeçalho do grupo. */
function Pendencia({ linha, podeDescartar }: {
  linha: PedidoIgnoradoLinha;
  podeDescartar: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const reduzir = useReducedMotion();
  const fechado = linha.descartadoEm !== null;
  const parado = diasParado(linha.primeiraVezEm);
  const causa = causaDe(linha.causa);
  const tom = TONS[causa.tom];
  const diagnostico = diagnosticoDe(linha);

  const [detalheAberto, setDetalheAberto] = useState(false);
  const idDetalhe = useId();

  function reprocessar() {
    iniciar(async () => {
      const resultado = await actionReprocessarPedidoIgnorado(linha.id);
      if (resultado.ok) {
        toast.success(resultado.jaExistia
          ? `Pedido ${linha.providerOrderId} já estava no CRM — pendência encerrada.`
          : `Pedido ${linha.providerOrderId} entrou.`);
      } else {
        // O erro novo pode ser DIFERENTE do antigo (o SKU entrou e agora
        // barra o cliente) — por isso a mensagem vem do resultado, não do
        // texto que já estava na tela.
        toast.error(`Ainda não entrou: ${resultado.motivo}`, { duration: 8000 });
      }
      // Busca o estado real em vez de adivinhar: quando o replay falha, a
      // linha CONTINUA na fila, agora com a causa e o motivo regravados.
      router.refresh();
    });
  }

  function descartar(desfazer: boolean) {
    iniciar(async () => {
      await actionDescartarPedidoIgnorado(linha.id, desfazer);
      toast.success(desfazer ? "Pendência devolvida à fila." : "Pendência descartada.");
      router.refresh();
    });
  }

  return (
    <motion.li
      layout
      variants={fadeUp}
      exit={reduzir ? { opacity: 0 } : { opacity: 0, x: 24, transition: springs.settleFast }}
      className={`group relative overflow-hidden rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/40 ${fechado ? "opacity-50" : ""}`}
    >
      {/* Véu de carregamento no lugar de trocar o texto do botão: a linha
          inteira fica claramente indisponível enquanto a ação viaja, e nada
          se desloca quando ela volta. */}
      {pendente && <span aria-hidden="true" className="absolute inset-0 z-10 animate-pulse bg-card/60" />}

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="font-mono text-sm font-bold tracking-tight text-foreground">{linha.providerOrderId}</span>
        <ChannelLogo canal={linha.canal} size="sm" variant="logo" />
        {isBrandSlug(linha.marcaSlug)
          ? <BrandLogo brand={linha.marcaSlug} height={14} />
          : <span className="text-xs font-semibold text-muted-foreground">{linha.marca}</span>}

        {fechado && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Descartado
          </span>
        )}

        {/* Tempo parado à direita, com destaque só depois de uma semana: um
            pedido de ontem na fila é rotina, um de duas semanas é dinheiro
            que ninguém viu. Sem o corte, todos os números competem igual. */}
        <span
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums"
          style={{ color: parado >= 7 && !fechado ? "var(--destructive)" : "var(--muted-foreground)" }}
          title={`Primeira falha em ${dataCurta(linha.primeiraVezEm)} · ${linha.tentativas} ${linha.tentativas === 1 ? "tentativa" : "tentativas"}`}
        >
          <Clock3 size={12} />
          {parado === 0 ? "hoje" : `há ${parado}d`}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">{linha.compradorNome ?? "Comprador não informado"}</span>
        {linha.total && (
          <span className="font-semibold tabular-nums" style={{ color: "var(--success)" }}>
            {moeda.format(Number(linha.total))}
          </span>
        )}
        {/* "pedido de 05/06" era ambíguo ao lado de "hoje"/"há 3d", que fala
            do tempo na fila: davam a impressão de ser a mesma data medida de
            dois jeitos. O rótulo agora nomeia o que a data é. */}
        <span className="text-[11px] text-muted-foreground">Pedido criado em {dataCurta(linha.pedidoEm)}</span>
      </div>

      {linha.skus.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {linha.skus.map((sku) => (
            <span key={sku} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{sku}</span>
          ))}
        </div>
      )}

      {/* Sempre visível, nunca atrás de "Ver detalhes": quem abre esta tela
          está justamente perguntando por que o pedido não entrou. Escondê-lo
          num acordeão faria a resposta custar um clique por linha. */}
      <div
        className="mt-2.5 rounded-lg border-l-2 py-0.5 pl-2.5"
        style={{ borderColor: `color-mix(in srgb, ${tom.cor} 55%, transparent)` }}
      >
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="font-bold text-foreground">Por que ficou de fora: </span>
          {diagnostico.motivo}
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="font-bold" style={{ color: tom.cor }}>Como resolver: </span>
          {diagnostico.resolucao}
        </p>
      </div>

      <DetalhePedido linha={linha} aberto={detalheAberto} id={idDetalhe} />

      {/* A barra de acoes existe sempre: mesmo sem reprocessar nem descartar,
          "Ver detalhes" e uma acao — antes a linha podia terminar sem nenhum
          jeito de saber mais sobre o pedido. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {/* Sem botão de reprocessar em `payload_invalido`: a falha é
              determinística — mesmo payload, mesmo validador, mesmo erro.
              Oferecer o botão ali só gasta o tempo de quem clica. */}
          {linha.reprocessavel && !fechado && (
            <button
              type="button"
              onClick={reprocessar}
              disabled={pendente}
              className="press-feedback inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {pendente ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
              Tentar novamente
            </button>
          )}
          {podeDescartar && (
            <button
              type="button"
              onClick={() => descartar(fechado)}
              disabled={pendente}
              className="press-feedback inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {fechado ? <Undo2 size={12} /> : <CircleSlash size={12} />}
              {fechado ? "Devolver à fila" : "Não recuperável"}
            </button>
          )}

          {/* Empurrado para a direita no desktop (ml-auto) e primeiro da
              proxima linha no celular: e leitura, nao decisao — nao deve
              disputar a atencao com "Tentar novamente". */}
          <button
            type="button"
            onClick={() => setDetalheAberto((atual) => !atual)}
            aria-expanded={detalheAberto}
            aria-controls={idDetalhe}
            className="press-feedback inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted sm:ml-auto"
          >
            <motion.span
              aria-hidden="true"
              className="inline-flex"
              animate={{ rotate: detalheAberto ? 180 : 0 }}
              transition={reduzir ? { duration: 0 } : springs.settleFast}
            >
              <ChevronDown size={12} />
            </motion.span>
            {detalheAberto ? "Ocultar detalhes" : "Ver detalhes"}
          </button>
        </div>
    </motion.li>
  );
}

const STATUS_LABELS: Record<string, string> = pagesConfig.pedidos.statusLabels;

/** O status vem cru do canal ("completed", "cancelled"). Traduz pelo MESMO
 *  mapa que o resto de Vendas usa — dois vocabularios para o mesmo pedido
 *  seria pior que nao mostrar. */
function rotuloStatus(statusCanal: string | null): string | null {
  if (!statusCanal) return null;
  return STATUS_LABELS[mapearStatusPedido(statusCanal)] ?? statusCanal;
}

/** Uma medida do detalhe. `tabular-nums` em tudo que e numero para as colunas
 *  alinharem verticalmente mesmo com larguras diferentes. */
function Medida({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      {/* title porque o valor trunca em coluna estreita (celular em pe, nome
          de comprador longo): o texto inteiro continua alcançavel. */}
      <dd title={valor} className="truncate text-[13px] font-bold tabular-nums" style={{ color: cor ?? "var(--foreground)" }}>{valor}</dd>
    </div>
  );
}

/** Item do pedido. A taxa some quando e zero — na maioria dos pedidos
 *  recusados o repasse nem chegou a ser calculado. */
function ItemLinha({ item }: { item: ItemPedidoIgnorado }) {
  const taxa = Number(item.taxaMarketplace ?? 0);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
      <span className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground">{item.sku ?? "sem SKU"}</span>
      <span className="tabular-nums text-muted-foreground">
        {item.quantidade ?? "?"} un. × {item.precoUnitario === null ? "—" : moeda.format(Number(item.precoUnitario))}
      </span>
      {taxa > 0 && <span className="tabular-nums text-muted-foreground">· taxa {moeda.format(taxa)}</span>}
    </li>
  );
}

/** Tudo que o CRM guardou do pedido recusado.
 *
 *  O payload e gravado inteiro na fila, entao nada aqui custa uma consulta a
 *  mais — so nao estava sendo lido. Fica fechado por padrao porque a fila
 *  existe para ser varrida rapido; quem precisa decidir sobre UM pedido abre
 *  o dele sem que os outros cresçam junto. */
function DetalhePedido({ linha, aberto, id }: { linha: PedidoIgnoradoLinha; aberto: boolean; id: string }) {
  const reduzir = useReducedMotion();
  const status = rotuloStatus(linha.statusCanal);
  const cancelado = linha.statusCanal !== null && mapearStatusPedido(linha.statusCanal) === "cancelado";
  const taxaTotal = linha.itens.reduce((soma, item) => soma + Number(item.taxaMarketplace ?? 0), 0);
  const dinheiro = (valor: string | null) => (valor === null ? "—" : moeda.format(Number(valor)));

  return (
    <AnimatePresence initial={false}>
      {aberto && (
        <motion.div
          key="detalhe"
          id={id}
          /* Altura animada em vez de fade puro: o cartao empurra os vizinhos
             para baixo, e ver esse empurrao acontecer e o que explica de onde
             o bloco saiu. Com "reduzir movimento" vira corte seco. */
          initial={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduzir ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          exit={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={reduzir ? { duration: 0 } : springs.settleFast}
          className="overflow-hidden"
        >
          <div className="mt-2.5 rounded-xl border border-border bg-muted/30 p-3">
            {status && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: `color-mix(in srgb, ${cancelado ? "var(--destructive)" : "var(--info)"} 14%, transparent)`,
                    color: cancelado ? "var(--destructive)" : "var(--info)",
                  }}
                >
                  {status} no canal
                </span>
                {/* Pedido cancelado nunca vira receita: quem olha a fila
                    precisa saber disso ANTES de gastar tempo recuperando. */}
                {cancelado && <span className="text-[11px] text-muted-foreground">nao vira receita mesmo se entrar</span>}
              </div>
            )}

            {/* 2 colunas no celular em pe, 3 em tela media (e no celular
                deitado, que ganha largura), 6 no desktop: a linha de valores
                nunca fica com uma coluna orfa. */}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 xl:grid-cols-6">
              <Medida rotulo="Total" valor={dinheiro(linha.total)} />
              <Medida rotulo="Frete" valor={dinheiro(linha.frete)} />
              <Medida rotulo="Desconto" valor={dinheiro(linha.desconto)} />
              <Medida rotulo="Acrescimo" valor={dinheiro(linha.acrescimo)} />
              <Medida rotulo="Taxa do canal" valor={taxaTotal > 0 ? moeda.format(taxaTotal) : "—"} />
              <Medida
                rotulo="Repasse"
                valor={dinheiro(linha.valorLiquido)}
                cor={linha.valorLiquido && Number(linha.valorLiquido) > 0 ? "var(--success)" : undefined}
              />
            </dl>

            {linha.itens.length > 0 && (
              <ul className="mt-3 grid gap-1.5 border-t border-border pt-3">
                {linha.itens.map((item, indice) => (
                  <ItemLinha key={`${item.sku ?? "item"}-${indice}`} item={item} />
                ))}
              </ul>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border pt-3 sm:grid-cols-4">
              <Medida rotulo="Comprador" valor={linha.compradorNome ?? "—"} />
              <Medida rotulo="Usuario no canal" valor={linha.compradorUsuario ?? "—"} />
              <Medida rotulo="Telefone" valor={linha.compradorTelefone ?? "—"} />
              <Medida rotulo="Tentativas" valor={String(linha.tentativas)} />
            </dl>

            {/* O motivo cru fecha o bloco: e o texto que o desenvolvedor le
                quando a causa classificada nao basta. */}
            <p className="mt-3 break-words border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Erro registrado:</span> {linha.motivo}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Um grupo = uma causa. O cabeçalho carrega a explicação inteira, e é o
 *  único lugar da tela onde ela aparece. */
function GrupoCausa({ chave, linhas, podeDescartar }: {
  chave: string;
  linhas: PedidoIgnoradoLinha[];
  podeDescartar: boolean;
}) {
  const causa = causaDe(chave);
  const tom = TONS[causa.tom];
  const Icone = causa.icone;
  const abertas = linhas.filter((l) => l.descartadoEm === null).length;

  return (
    <motion.section layout variants={fadeUp} className="mb-5">
      <div
        className="rounded-[1.1rem] border p-4"
        style={{
          borderColor: `color-mix(in srgb, ${tom.cor} 22%, transparent)`,
          background: `color-mix(in srgb, ${tom.cor} 5%, var(--card))`,
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full"
            style={{ background: `color-mix(in srgb, ${tom.cor} 14%, transparent)`, color: tom.cor }}
          >
            <Icone size={16} />
          </span>
          <h2 className="text-sm font-bold text-foreground">{causa.rotulo}</h2>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
            style={{ background: `color-mix(in srgb, ${tom.cor} 14%, transparent)`, color: tom.cor }}
          >
            {abertas} {abertas === 1 ? "pedido" : "pedidos"}
          </span>
          <span
            className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ borderColor: `color-mix(in srgb, ${tom.cor} 30%, transparent)`, color: tom.cor }}
          >
            {tom.etiqueta}
          </span>
        </div>

        {/* Uma linha só: a regra geral da causa. O diagnóstico completo desceu
            para dentro de cada cartão, onde ele fala do pedido daquela linha
            (qual SKU, qual comprador, cancelado ou não) em vez de repetir o
            mesmo parágrafo quarenta vezes. */}
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{causa.resumo}</p>
      </div>

      <motion.ul layout variants={stagger} initial="hidden" animate="show" className="mt-2 flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {linhas.map((linha) => (
            <Pendencia key={linha.id} linha={linha} podeDescartar={podeDescartar} />
          ))}
        </AnimatePresence>
      </motion.ul>
    </motion.section>
  );
}

export function PedidosIgnoradosLista({ linhas, podeDescartar, incluirFechados }: {
  linhas: PedidoIgnoradoLinha[];
  podeDescartar: boolean;
  incluirFechados: boolean;
}) {
  // A lista vem direto das props, sem cópia em estado local.
  //
  // A primeira versão guardava `useState(linhasIniciais)` e removia a linha
  // na mão depois de cada ação. Dois defeitos: `useState` ignora props novas,
  // então o `revalidatePath` da action recarregava o servidor e a tela
  // continuava mostrando a lista velha; e a remoção era feita mesmo quando o
  // reprocessamento FALHAVA — a pendência sumia da tela sem ter saído da
  // fila, reaparecendo no próximo carregamento. Agora quem manda é o
  // servidor, e `router.refresh()` traz o estado real depois de cada ação.
  const abertas = linhas.filter((linha) => linha.descartadoEm === null);
  const valorParado = abertas.reduce((soma, linha) => soma + Number(linha.total ?? 0), 0);
  const maisAntiga = abertas.reduce<number>(
    (maior, linha) => Math.max(maior, diasParado(linha.primeiraVezEm)),
    0,
  );

  /* ── Tentar a fila inteira ────────────────────────────────────────────
     Uma fila grande costuma ter uma causa só: alguma coisa mudou no CRM e
     agora todas entram. Com quarenta pendências, clicar quarenta vezes no
     mesmo botão não é decisão de operação, é trabalho braçal. O servidor
     tenta em fatias e devolve quantas sobraram — daí o botão dizer "faltam
     N" em vez de fingir que fez tudo. */
  const router = useRouter();
  const [tentandoTodos, iniciarLote] = useTransition();
  const reprocessaveis = abertas.filter((linha) => linha.reprocessavel).length;

  function tentarTodos() {
    iniciarLote(async () => {
      try {
        const { tentados, resolvidos, restantes } = await actionReprocessarFilaAberta();
        if (resolvidos > 0) toast.success(`${resolvidos} de ${tentados} entraram no CRM.`);
        else toast.error(`Nenhum dos ${tentados} entrou — o motivo de cada um foi atualizado abaixo.`);
        if (restantes > 0) toast.info(`Faltam ${restantes} na fila. Clique de novo para continuar.`);
      } catch {
        toast.error("Não foi possível tentar a fila agora.");
      }
      router.refresh();
    });
  }

  const grupos = ORDEM_CAUSAS
    .map((chave) => ({ chave, linhas: linhas.filter((linha) => linha.causa === chave) }))
    .filter((grupo) => grupo.linhas.length > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      {/* Esta tela se chega por um link dentro de /vendas e não tem entrada
          no menu — sem a volta, a única saída era o botão do navegador ou
          reentrar por Vendas no topo. Mesmo padrão das telas de Publicidade. */}
      <Link
        href="/vendas"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} /> Voltar para Vendas
      </Link>
      <PageHeader
        title="Pedidos ignorados"
        description="Pedidos que o canal entregou e o CRM não conseguiu importar. A fila se limpa sozinha na próxima sincronização quando a causa deixa de existir."
        actions={
          <>
            {reprocessaveis > 1 && !incluirFechados && (
              <button
                type="button"
                onClick={tentarTodos}
                disabled={tentandoTodos}
                className="press-feedback inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {tentandoTodos
                  ? <><Loader2 size={13} className="animate-spin" /> Tentando…</>
                  : <><RotateCw size={13} /> Tentar todos ({reprocessaveis})</>}
              </button>
            )}
            <a
              href={incluirFechados ? "/vendas/pedidos-ignorados" : "/vendas/pedidos-ignorados?historico=1"}
              className="press-feedback inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted"
            >
              {incluirFechados ? "Ver só a fila aberta" : "Ver histórico completo"}
            </a>
          </>
        }
      />

      {linhas.length === 0 ? (
        <EmptyState
          title="Nenhum pedido ficou de fora"
          description="Tudo que os canais entregaram foi importado. Esta tela só ganha conteúdo quando alguma importação falha — e ela some sozinha quando a causa deixa de existir."
          illustration="filaLimpa"
        />
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show">
          {/* Uma linha de resumo, não uma grade de cards. O que importa aqui
              é quanto dinheiro está parado e há quanto tempo — dois números.
              Cards dariam a eles o mesmo peso visual dos grupos abaixo, que
              são o conteúdo de verdade desta tela. */}
          <motion.p variants={fadeUp} className="mb-4 text-xs font-semibold text-muted-foreground">
            {abertas.length} {abertas.length === 1 ? "pedido fora do CRM" : "pedidos fora do CRM"}
            {valorParado > 0 && <> · <span className="text-foreground">{moeda.format(valorParado)}</span> parados</>}
            {maisAntiga > 0 && <> · o mais antigo há {maisAntiga}d</>}
            {incluirFechados && ` · ${linhas.length - abertas.length} fechados`}
          </motion.p>

          <AnimatePresence initial={false}>
            {grupos.map((grupo) => (
              <GrupoCausa
                key={grupo.chave}
                chave={grupo.chave}
                linhas={grupo.linhas}
                podeDescartar={podeDescartar}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
