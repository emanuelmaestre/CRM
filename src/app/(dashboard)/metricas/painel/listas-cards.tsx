"use client";

import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { EmptyState, type IllustrationType } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { listItem, springs, stagger } from "@/shared/design-system/motion-variants";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead, useContagem } from "../metricas-primitives";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import type {
  ProdutoGiroBaixo,
  ProdutoMaisVendido,
  ProdutoParado,
  ProdutoReposicao,
  StatusAnuncioParado,
} from "@/modules/metricas/application/dashboard.service";

/* ── Linha de produto ──────────────────────────────────────────
   Nome e SKU à esquerda, número que importa à direita. O medidor
   opcional dá a proporção sem gastar uma coluna de texto. A marca vem
   na cor de identidade dela (mesma usada nos filtros) — assim dá pra
   escanear de qual empresa é cada item sem ler o texto todo. */
function LinhaProduto({ nome, sku, marca, marcaSlug, destaque, destaqueNumerico, formatarDestaque, destaqueLabel, destaqueCor, contexto, medidor, medidorCor, acento, statusBadge }: {
  nome: string;
  sku: string;
  marca: string;
  marcaSlug: string;
  destaque: string;
  /** Quando presente, o número em destaque sobe animado; `destaque` continua
   *  servindo pro reduced-motion e pra largura do skeleton. */
  destaqueNumerico?: number;
  formatarDestaque?: (valorAnimado: number) => string;
  /** Rótulo curto antes do número em destaque (ex.: "saldo") — só pra quando
   *  o número sozinho não deixa claro o que está sendo medido. */
  destaqueLabel?: string;
  destaqueCor?: string;
  contexto: string;
  medidor?: number;
  /** Cor do medidor quando precisa acompanhar a gravidade da linha (ex.: quanto
   *  mais dias parado, mais vermelho) em vez do acento fixo do card inteiro. */
  medidorCor?: string;
  acento: string;
  /** Selo opcional de status (ex.: situação do anúncio no Mercado Livre) — só
   *  o card de Estoque Parado usa isto hoje; os demais ficam sem, por padrão. */
  statusBadge?: React.ReactNode;
}) {
  const corMarca = isBrandSlug(marcaSlug) ? getBrandConfig(marcaSlug)?.color : undefined;
  const destaqueAnimado = useContagem(destaqueNumerico ?? 0);
  return (
    <motion.li variants={listItem} className="border-b border-border px-5 py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{nome}</p>
          {/* SKU/Empresa/Status formam um bloco só de metadado sobre o mesmo
              produto — ficam coladas entre si (leading-tight, mt mínimo) e com
              mais respiro só em relação ao nome acima, que é a info principal. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-tight text-muted-foreground">
            <span className="truncate"><span className="text-muted-foreground/70">SKU:</span> {sku}</span>
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground/70">Empresa:</span>
              {isBrandSlug(marcaSlug)
                ? <BrandLogo brand={marcaSlug} height={15} />
                : <span className="font-semibold" style={corMarca ? { color: corMarca } : undefined}>{marca}</span>}
            </span>
          </p>
          {statusBadge && (
            <p className="mt-0.5 flex items-center gap-1 text-xs leading-tight text-muted-foreground">
              <span className="text-muted-foreground/70">Status:</span>
              {statusBadge}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p
            className="text-sm font-bold tabular-nums"
            style={{ color: destaqueCor ?? "var(--foreground)" }}
          >
            {destaqueLabel && <span className="text-[11px] font-semibold text-muted-foreground">{destaqueLabel}: </span>}
            {destaqueNumerico !== undefined && formatarDestaque ? formatarDestaque(destaqueAnimado) : destaque}
          </p>
          <p className="mt-0.5 text-xs font-semibold tabular-nums text-foreground/80">{contexto}</p>
        </div>
      </div>
      {medidor !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: Math.max(medidor, 2) / 100 }}
            transition={springs.settle}
            className="h-full rounded-full"
            style={{ transformOrigin: "left", background: medidorCor ?? acento }}
          />
        </div>
      )}
    </motion.li>
  );
}

function EsqueletoLista() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {[0, 1, 2].map((linha) => (
        <div key={linha} className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}

/* ── Casca de card de lista ───────────────────────────────────── */
function ListaCard({ vazio, carregando, semFiltro, ilustracao, vazioTitulo, vazioDescricao, scope, children }: {
  vazio: boolean;
  carregando: boolean;
  semFiltro: boolean;
  ilustracao: IllustrationType;
  vazioTitulo: string;
  vazioDescricao: string;
  scope?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Troca de conteúdo é feita por crossfade (AnimatePresence), nunca por
  // desmontar o Card inteiro — é isso que evita o "piscar" ao trocar de
  // filtro. Enquanto uma busca nova está em voo mas já existe conteúdo
  // anterior na tela, ele fica visível e só esmaece um pouco.
  return (
    <Card>
      <CardHead scope={scope} />
      <motion.div
        animate={{ opacity: carregando ? 0.55 : 1 }}
        transition={springs.settleFast}
      >
        <AnimatePresence mode="wait" initial={false}>
          {semFiltro ? (
            <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springs.settleFast}>
              <EmptyState illustration={ilustracao} title="Selecione um filtro" description="Escolha uma marca ou canal acima para ver os dados deste painel." />
            </motion.div>
          ) : carregando && vazio ? (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springs.settleFast}>
              <EsqueletoLista />
            </motion.div>
          ) : vazio ? (
            <motion.div key="vazio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springs.settleFast}>
              <EmptyState illustration={ilustracao} title={vazioTitulo} description={vazioDescricao} />
            </motion.div>
          ) : (
            <motion.ul key="lista" variants={stagger} initial="hidden" animate="show" className="mt-4">
              {children}
            </motion.ul>
          )}
        </AnimatePresence>
      </motion.div>
    </Card>
  );
}

/* ── 1. Vendem mais ───────────────────────────────────────────── */
const copyVendidos = dashboardConfig.cards.maisVendidos;

/** Um campeão de vendas com o anúncio pausado/em revisão é o caso mais
 *  urgente entre os 4 cards: a receita já estava entrando de verdade e
 *  parou — diferente de Estoque Parado/Repor, aqui não é um risco futuro,
 *  é uma perda acontecendo agora. */
function statusAnuncioInfoMaisVendidos(item: ProdutoMaisVendido): { label: string; className: string; hint: string } {
  const motivo = item.motivoStatus ? ` (${item.motivoStatus})` : "";

  const MAPA: Record<StatusAnuncioParado, { label: string; className: string; hint: string }> = {
    ativo: {
      label: "Ativo no ML",
      className: "bg-success/10 text-success",
      hint: `O anúncio está publicado e visível no Mercado Livre. As ${item.quantidade} ${copyVendidos.unitLabel} deste período ocorreram enquanto ele estava no ar normalmente.`,
    },
    pausado: {
      label: "Pausado",
      className: "bg-warning/10 text-warning",
      hint: `Este anúncio está pausado no Mercado Livre${motivo}. Mesmo sendo um dos mais vendidos do período, ninguém consegue comprar enquanto ele permanecer assim.`,
    },
    em_revisao: {
      label: "Em revisão no ML",
      className: "bg-acento-2/10 text-acento-2",
      hint: `O Mercado Livre pausou este anúncio para moderação${motivo}. As vendas registradas ocorreram antes da pausa. Ele poderá voltar assim que o problema for corrigido.`,
    },
    encerrado: {
      label: "Encerrado no ML",
      className: "bg-destructive/10 text-destructive",
      hint: `Este anúncio não existe mais no Mercado Livre${motivo}. As vendas mostradas ocorreram antes do encerramento. Atualmente, ninguém consegue comprar por lá.`,
    },
    sem_vinculo: {
      label: "Sem vínculo com o ML",
      className: "bg-info/10 text-info",
      hint: "Não encontramos nenhum anúncio deste produto vinculado a uma conta do Mercado Livre. O vínculo pode ter se perdido.",
    },
    nao_consultado: {
      label: "Status indisponível",
      className: "bg-muted text-muted-foreground",
      hint: "Não foi possível confirmar agora o status deste anúncio no Mercado Livre devido a uma falha temporária na consulta. Os demais dados continuam confiáveis.",
    },
  };
  return MAPA[item.statusAnuncio];
}

export function MaisVendidosCard({ itens, carregando, semFiltro, scope, acaoSlot }: {
  itens: ProdutoMaisVendido[] | null;
  carregando: boolean;
  semFiltro: boolean;
  scope?: React.ReactNode;
  acaoSlot?: HTMLElement | null;
}) {
  const lista = itens ?? [];
  return (
    <>
      <AcaoSlotFiltro scope={scope} acaoSlot={acaoSlot} extra={<EntendaStatusBotao />} />
      {acaoSlot && createPortal(<div className="sm:hidden"><EntendaStatusBotao /></div>, acaoSlot)}
      <ListaCard
        vazio={lista.length === 0}
        carregando={carregando}
        semFiltro={semFiltro}
        ilustracao="bestSellers"
        vazioTitulo={copyVendidos.emptyTitle}
        vazioDescricao={copyVendidos.emptyDescription}
        scope={<div className="flex w-full flex-wrap justify-center gap-2 sm:hidden">{scope}</div>}
      >
        {lista.map((item) => (
          <LinhaProduto
            key={item.produtoId}
            nome={item.nome}
            sku={item.sku}
            marca={item.marcaLabel}
            marcaSlug={item.marca}
            destaque={`${item.quantidade} ${copyVendidos.unitLabel}`}
            destaqueNumerico={item.quantidade}
            formatarDestaque={(v) => `${Math.round(v)} ${copyVendidos.unitLabel}`}
            destaqueCor={copyVendidos.accent}
            contexto={item.receita}
            acento={copyVendidos.accent}
            statusBadge={<SeloStatus status={statusAnuncioInfoMaisVendidos(item)} />}
          />
        ))}
      </ListaCard>
    </>
  );
}

/* ── 2. Repor em breve ────────────────────────────────────────── */
const copyReposicao = dashboardConfig.cards.reposicao;

/** Mesma ideia do Estoque Parado: saber se o anúncio por trás do número
 *  ainda está no ar muda a leitura — um item "perto do mínimo" com o
 *  anúncio pausado não vai vender mesmo, repor não resolve nada até
 *  reativar o anúncio primeiro. */
function statusAnuncioInfoReposicao(item: ProdutoReposicao): { label: string; className: string; hint: string } {
  const motivo = item.motivoStatus ? ` (${item.motivoStatus})` : "";

  const MAPA: Record<StatusAnuncioParado, { label: string; className: string; hint: string }> = {
    ativo: {
      label: "Ativo no ML",
      className: "bg-success/10 text-success",
      hint: "O anúncio está publicado e visível no Mercado Livre. O alerta de reposição é válido, pois ele está pronto para continuar vendendo assim que a mercadoria chegar.",
    },
    pausado: {
      label: "Pausado",
      className: "bg-warning/10 text-warning",
      hint: `Este anúncio está pausado no Mercado Livre${motivo}. Repor o estoque não será suficiente, pois ninguém conseguirá comprar até que o anúncio seja reativado.`,
    },
    em_revisao: {
      label: "Em revisão no ML",
      // Cor própria (não âmbar) — "Pausado" e "Em revisão" são coisas
      // diferentes (uma é decisão sua, a outra é o ML barrando por um
      // problema), com a mesma cor ficavam parecendo a mesma categoria.
      className: "bg-acento-2/10 text-acento-2",
      hint: `O Mercado Livre pausou este anúncio para moderação${motivo} e solicitou uma correção. Ele poderá voltar a vender assim que o problema for resolvido. A reposição pode ser antecipada.`,
    },
    encerrado: {
      label: "Encerrado no ML",
      className: "bg-destructive/10 text-destructive",
      hint: `Este anúncio não existe mais no Mercado Livre${motivo}. Repor o item não produzirá efeito até que o anúncio seja recriado.`,
    },
    sem_vinculo: {
      label: "Sem vínculo com o ML",
      className: "bg-info/10 text-info",
      hint: "Não encontramos nenhum anúncio deste produto vinculado a uma conta do Mercado Livre. O vínculo pode ter se perdido.",
    },
    nao_consultado: {
      label: "Status indisponível",
      className: "bg-muted text-muted-foreground",
      hint: "Não foi possível confirmar agora o status deste anúncio no Mercado Livre devido a uma falha temporária na consulta. Os demais dados continuam confiáveis.",
    },
  };
  return MAPA[item.statusAnuncio];
}

export function ReposicaoCard({ itens, carregando, semFiltro, scope, acaoSlot }: {
  itens: ProdutoReposicao[] | null;
  carregando: boolean;
  semFiltro: boolean;
  scope?: React.ReactNode;
  /** Nó do cabeçalho do Foco onde o botão Status é portado. Sozinho aqui —
   *  este card não tem Período (ver mosaico.tsx), então o slot da barra de
   *  período à esquerda leva o "Atualizado às" no lugar (ver mosaico.tsx),
   *  e este, à direita, fica só com Status, embaixo do X de fechar. */
  acaoSlot?: HTMLElement | null;
}) {
  const lista = itens ?? [];
  return (
    <>
      {/* Fora do ListaCard de propósito — ver comentário maior em ParadosCard. */}
      <AcaoSlotFiltro scope={scope} acaoSlot={acaoSlot} extra={<EntendaStatusBotao />} />
      {acaoSlot && createPortal(<div className="sm:hidden"><EntendaStatusBotao /></div>, acaoSlot)}
      <ListaCard
        vazio={lista.length === 0}
        carregando={carregando}
        semFiltro={semFiltro}
        ilustracao="restock"
        vazioTitulo={copyReposicao.emptyTitle}
        vazioDescricao={copyReposicao.emptyDescription}
        scope={<div className="flex w-full flex-wrap justify-center gap-2 sm:hidden">{scope}</div>}
      >
        {lista.map((item) => (
          <LinhaProduto
            key={item.produtoId}
            nome={item.nome}
            sku={item.sku}
            marca={item.marcaLabel}
            marcaSlug={item.marca}
            destaque={`${item.saldo}`}
            destaqueNumerico={item.saldo}
            formatarDestaque={(v) => String(Math.round(v))}
            destaqueLabel={copyReposicao.saldoLabel}
            destaqueCor={copyReposicao.accent}
            contexto={item.coberturaDias !== null
              ? `${item.coberturaDias} d ${copyReposicao.coverageLabel}`
              : `${copyReposicao.minLabel} ${item.minimo}`}
            acento={copyReposicao.accent}
            statusBadge={<SeloStatus status={statusAnuncioInfoReposicao(item)} />}
          />
        ))}
      </ListaCard>
    </>
  );
}

/* ── 3. Giro baixo ────────────────────────────────────────────── */
const copyGiro = dashboardConfig.cards.giroBaixo;

/** Um produto que quase não vende com o anúncio pausado/em revisão muda a
 *  decisão: o problema pode não ser falta de demanda, e sim o anúncio fora
 *  do ar — vale reativar antes de cogitar liquidar o estoque parado nele. */
function statusAnuncioInfoGiroBaixo(item: ProdutoGiroBaixo): { label: string; className: string; hint: string } {
  const motivo = item.motivoStatus ? ` (${item.motivoStatus})` : "";

  const MAPA: Record<StatusAnuncioParado, { label: string; className: string; hint: string }> = {
    ativo: {
      label: "Ativo no ML",
      className: "bg-success/10 text-success",
      hint: "O anúncio está publicado e visível no Mercado Livre. O giro baixo aqui é sobre demanda mesmo, não sobre o anúncio estar fora do ar.",
    },
    pausado: {
      label: "Pausado",
      className: "bg-warning/10 text-warning",
      hint: `Este anúncio está pausado no Mercado Livre${motivo}. O giro baixo pode ser reflexo disso, já que ninguém consegue comprar enquanto ele ficar assim.`,
    },
    em_revisao: {
      label: "Em revisão no ML",
      className: "bg-acento-2/10 text-acento-2",
      hint: `O Mercado Livre pausou este anúncio para moderação${motivo}. Ele pode voltar a vender assim que o problema for corrigido, vale reavaliar o giro depois disso.`,
    },
    encerrado: {
      label: "Encerrado no ML",
      className: "bg-destructive/10 text-destructive",
      hint: `Este anúncio não existe mais no Mercado Livre${motivo}. O giro baixo não reflete demanda real: ninguém consegue comprar por lá.`,
    },
    sem_vinculo: {
      label: "Sem vínculo com o ML",
      className: "bg-info/10 text-info",
      hint: "Não encontramos nenhum anúncio deste produto vinculado a uma conta do Mercado Livre. O vínculo pode ter se perdido.",
    },
    nao_consultado: {
      label: "Status indisponível",
      className: "bg-muted text-muted-foreground",
      hint: "Não foi possível confirmar agora o status deste anúncio no Mercado Livre devido a uma falha temporária na consulta. Os demais dados continuam confiáveis.",
    },
  };
  return MAPA[item.statusAnuncio];
}

export function GiroBaixoCard({ itens, carregando, semFiltro, scope, acaoSlot }: {
  itens: ProdutoGiroBaixo[] | null;
  carregando: boolean;
  semFiltro: boolean;
  scope?: React.ReactNode;
  acaoSlot?: HTMLElement | null;
}) {
  const lista = itens ?? [];
  return (
    <>
    <AcaoSlotFiltro scope={scope} acaoSlot={acaoSlot} extra={<EntendaStatusBotao />} />
      {acaoSlot && createPortal(<div className="sm:hidden"><EntendaStatusBotao /></div>, acaoSlot)}
    <ListaCard
      vazio={lista.length === 0}
      carregando={carregando}
      semFiltro={semFiltro}
      ilustracao="slowMoving"
      vazioTitulo={copyGiro.emptyTitle}
      vazioDescricao={copyGiro.emptyDescription}
      scope={<div className="flex w-full flex-wrap justify-center gap-2 sm:hidden">{scope}</div>}
    >
      {lista.map((item) => (
        <LinhaProduto
          key={item.produtoId}
          nome={item.nome}
          sku={item.sku}
          marca={item.marcaLabel}
          marcaSlug={item.marca}
          destaque={item.quantidade === 0
            ? copyGiro.noSaleLabel
            : `${item.quantidade} ${item.quantidade === 1 ? copyGiro.saleLabel : copyGiro.salesLabel}`}
          {...(item.quantidade > 0 ? {
            destaqueNumerico: item.quantidade,
            formatarDestaque: (v: number) => `${Math.round(v)} ${Math.round(v) === 1 ? copyGiro.saleLabel : copyGiro.salesLabel}`,
          } : {})}
          destaqueCor={item.quantidade === 0 ? "var(--muted-foreground)" : undefined}
          contexto={`${item.saldo} ${copyGiro.stockLabel} · ${item.valorParado}`}
          acento={copyGiro.accent}
          statusBadge={<SeloStatus status={statusAnuncioInfoGiroBaixo(item)} />}
        />
      ))}
    </ListaCard>
    </>
  );
}

/* ── 4. Estoque parado ────────────────────────────────────────── */
const copyParados = dashboardConfig.cards.parados;

/* ── Status do anúncio ────────────────────────────────────────
   "Parado" sozinho não diz se é o mercado que não compra ou se o próprio
   anúncio está fora do ar — achado real ao auditar os dados de produção
   (produtos pausados pelo vendedor apareciam misturados com os realmente
   ativos e sem venda). O texto do popover é montado com os dados reais do
   item (dias, saldo, motivo do ML), nunca uma frase fixa igual pra todos. */
function statusAnuncioInfo(item: ProdutoParado): { label: string; className: string; hint: string } {
  const tempo = item.diasParado !== null ? `há ${item.diasParado} dias` : "desde que entrou no catálogo";
  const motivo = item.motivoStatus ? ` (${item.motivoStatus})` : "";

  const MAPA: Record<StatusAnuncioParado, { label: string; className: string; hint: string }> = {
    ativo: {
      label: "Ativo no ML",
      className: "bg-success/10 text-success",
      hint: `O anúncio está publicado e visível no Mercado Livre, mas não registrou nenhuma venda ${tempo}. Ele está no ar, porém não vende.`,
    },
    pausado: {
      label: "Pausado",
      className: "bg-warning/10 text-warning",
      hint: `Este anúncio está pausado no Mercado Livre${motivo}. Por isso, não aparece para compra, o que explica a ausência de vendas ${tempo}.`,
    },
    em_revisao: {
      label: "Em revisão no ML",
      // Cor própria (não âmbar) — "Pausado" e "Em revisão" são coisas
      // diferentes (uma é decisão sua, a outra é o ML barrando por um
      // problema), com a mesma cor ficavam parecendo a mesma categoria.
      className: "bg-acento-2/10 text-acento-2",
      hint: `O Mercado Livre pausou este anúncio para moderação${motivo} e solicitou uma correção. Isso não equivale ao encerramento; ele poderá voltar a vender assim que o problema for resolvido.`,
    },
    encerrado: {
      label: "Encerrado no ML",
      className: "bg-destructive/10 text-destructive",
      hint: `Este anúncio não existe mais no Mercado Livre${motivo}, mas o produto continua no catálogo com ${item.saldo} unidade${item.saldo === 1 ? "" : "s"} em estoque: ninguém consegue comprar por lá.`,
    },
    sem_vinculo: {
      label: "Sem vínculo com o ML",
      className: "bg-info/10 text-info",
      hint: "Não encontramos nenhum anúncio deste produto vinculado a uma conta do Mercado Livre. O vínculo pode ter se perdido.",
    },
    nao_consultado: {
      label: "Status indisponível",
      className: "bg-muted text-muted-foreground",
      hint: "Não foi possível confirmar agora o status deste anúncio no Mercado Livre devido a uma falha temporária na consulta. Os demais dados continuam confiáveis.",
    },
  };
  return MAPA[item.statusAnuncio];
}

/** Cor de gravidade: quanto mais tempo parado, mais o número puxa pro
 *  vermelho — sem isso, 92 dias e 149 dias tinham exatamente o mesmo peso
 *  visual, e é bem diferente na prática. Só o número carrega o sinal: uma
 *  barra embaixo repetindo a mesma cor era redundante e pesava a lista. */
function corGravidade(diasParado: number | null): string {
  if (diasParado === null) return "var(--muted-foreground)";
  if (diasParado >= 150) return "var(--destructive)";
  if (diasParado >= 120) return "var(--warning)";
  return "var(--foreground)";
}

/** Catálogo fixo dos 5 status possíveis — não muda por item, é a legenda
 *  completa, pra quem nunca viu um "Encerrado" na tela ainda saber o que
 *  significa antes de precisar achar um pra tocar e descobrir. */
// Textos neutros de propósito: essa legenda é compartilhada por qualquer
// card que tenha selo de status (Estoque Parado, Repor em breve, ...) —
// uma versão amarrada a "não vende" (só fazia sentido em Parado) ficava
// errada em Reposição, onde o produto pode até vender bem.
const LEGENDA_STATUS: Array<{ titulo: string; texto: string; cor: string }> = [
  { titulo: "Ativo no ML", cor: "var(--success)", texto: "O anúncio está publicado e visível no Mercado Livre. Do ponto de vista técnico, está tudo certo." },
  { titulo: "Pausado", cor: "var(--warning)", texto: "Você pausou o anúncio. Ninguém consegue comprar enquanto ele permanecer pausado." },
  // Confirmado na documentação oficial do Mercado Livre: "under_review" é
  // moderação (o anúncio tem um problema a corrigir), não é a mesma coisa
  // que "closed" — pode voltar a ficar ativo, "closed" nunca volta.
  { titulo: "Em revisão no ML", cor: "var(--acento-2)", texto: "O Mercado Livre pausou o anúncio para moderação. Existe algo a corrigir, mas ele poderá voltar a ficar ativo, ao contrário de um anúncio encerrado." },
  { titulo: "Encerrado no ML", cor: "var(--destructive)", texto: "O anúncio não existe mais lá, mas o produto continua no catálogo do CRM: ninguém consegue comprar por nenhum canal." },
  { titulo: "Sem vínculo com o ML", cor: "var(--info)", texto: "Não encontramos nenhum anúncio deste produto vinculado a uma conta do Mercado Livre. O vínculo pode ter sido perdido." },
  { titulo: "Status indisponível", cor: "var(--muted-foreground)", texto: "Houve uma falha temporária ao consultar o Mercado Livre. Os demais dados continuam confiáveis." },
];

/** Selo de status por item — mesmo visual em qualquer card que mostre a
 *  situação do anúncio no ML (Estoque Parado, Repor em breve, ...). */
function SeloStatus({ status }: { status: { label: string; className: string; hint: string } }) {
  // Só a cor do texto (ex.: "text-success"), sem o fundo — o pill colorido
  // ("bg-success/10" etc.) ficava grande demais do lado do resto da linha.
  // Negrito é o que carrega a ênfase agora, em qualquer tamanho de tela.
  const corTexto = status.className.split(" ").find((classe) => classe.startsWith("text-")) ?? "text-muted-foreground";
  return (
    <AnimatedInfoPopover
      trigger={(
        <button
          type="button"
          aria-label={`Entenda o status ${status.label}`}
          onClick={(event) => event.stopPropagation()}
          className={`press-feedback cursor-pointer text-[10.5px] font-extrabold uppercase tracking-wide transition-opacity hover:opacity-80 ${corTexto}`}
        >
          {status.label}
        </button>
      )}
      align="start"
      sideOffset={6}
      collisionPadding={12}
      className="z-[100] w-64 rounded-xl border border-border bg-card p-3 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
    >
      <p className="text-[12px] leading-relaxed text-foreground/85">{status.hint}</p>
    </AnimatedInfoPopover>
  );
}

/** Bloco portado pro cabeçalho do painel: pílulas de marca/canal centralizadas
 *  + botão "Entenda os status" fixo à direita — mesmo esqueleto pra qualquer
 *  card que tenha selo de status do ML (ver comentário maior em ParadosCard). */
export function AcaoSlotFiltro({ scope, acaoSlot, extra }: {
  scope?: React.ReactNode;
  acaoSlot?: HTMLElement | null;
  /** Ação extra à direita (ex.: "Entenda os status") — cards sem selo de
   *  status (Faturamento, Vendem mais...) não passam isso, só centralizam
   *  o filtro sozinho. */
  extra?: React.ReactNode;
}) {
  if (!acaoSlot) return null;
  return createPortal(
    <div className="hidden w-full items-center gap-3 sm:flex">
      <div className="mx-auto flex min-w-0 flex-wrap items-center justify-center gap-2">{scope}</div>
      {extra && (
        <>
          <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
          {extra}
        </>
      )}
    </div>,
    acaoSlot,
  );
}

function EntendaStatusBotao() {
  return (
    <AnimatedInfoPopover
      trigger={(
        <AnimatedInfoTrigger
          title="Entenda os status do anúncio no Mercado Livre"
          iconSize={13}
          className="press-feedback inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          <span className="sm:hidden">Status</span>
          <span className="hidden sm:inline">Entenda os status</span>
        </AnimatedInfoTrigger>
      )}
      align="end"
      sideOffset={8}
      collisionPadding={12}
      // No desktop o popover fica mais largo e os 5 status se dividem em 2
      // colunas — no mobile continua empilhado (não tem largura de sobra).
      className="z-[100] w-[min(22rem,calc(100vw-1.5rem))] rounded-[1.1rem] border border-border bg-card p-5 shadow-[0_16px_40px_rgba(14,15,19,.24)] lg:w-[min(30rem,calc(100vw-1.5rem))]"
    >
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">Status do anúncio no ML</p>
      <dl className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-x-5 lg:gap-y-4">
        {LEGENDA_STATUS.map((item) => (
          <div key={item.titulo}>
            <dt className="text-[12.5px] font-bold" style={{ color: item.cor }}>{item.titulo}</dt>
            <dd className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{item.texto}</dd>
          </div>
        ))}
      </dl>
    </AnimatedInfoPopover>
  );
}

export function ParadosCard({ itens, carregando, semFiltro, scope, acaoSlot }: {
  itens: ProdutoParado[] | null;
  carregando: boolean;
  semFiltro: boolean;
  scope?: React.ReactNode;
  /** Nó do cabeçalho do Foco onde o botão "Entenda os status" é portado —
   *  mesmo mecanismo que o "Entenda o score" do Score da loja, ver bloco.tsx. */
  acaoSlot?: HTMLElement | null;
}) {
  const lista = itens ?? [];
  return (
    <>
      {/* Fora do ListaCard de propósito: `children` do ListaCard só renderiza
          quando já existe filtro selecionado (ver AnimatePresence ali dentro)
          — botão e pílulas dentro dele ficavam invisíveis (e, pior, sem filtro
          nenhum visível em lugar nenhum no desktop) até o usuário escolher uma
          marca, só que não tinha como escolher porque o filtro tinha sumido. */}
      <AcaoSlotFiltro scope={scope} acaoSlot={acaoSlot} extra={<EntendaStatusBotao />} />
      {acaoSlot && createPortal(<div className="sm:hidden"><EntendaStatusBotao /></div>, acaoSlot)}
      <ListaCard
        vazio={lista.length === 0}
        carregando={carregando}
        semFiltro={semFiltro}
        ilustracao="deadStock"
        vazioTitulo={copyParados.emptyTitle}
        vazioDescricao={copyParados.emptyDescription}
        // No desktop as pílulas de marca/canal sobem pro cabeçalho do painel
        // (junto do período e do "Entenda os status") — sem sobrar espaço no
        // mobile pra isso, então lá elas continuam aqui embaixo, como sempre.
        scope={<div className="flex w-full flex-wrap justify-center gap-2 sm:hidden">{scope}</div>}
      >
      {lista.map((item) => {
        const status = statusAnuncioInfo(item);
        return (
          <LinhaProduto
            key={item.produtoId}
            nome={item.nome}
            sku={item.sku}
            marca={item.marcaLabel}
            marcaSlug={item.marca}
            destaque={item.diasParado !== null
              ? `${item.diasParado} d`
              : copyParados.neverLabel}
            {...(item.diasParado !== null ? {
              destaqueNumerico: item.diasParado,
              formatarDestaque: (v: number) => `${Math.round(v)} d`,
            } : {})}
            destaqueCor={corGravidade(item.diasParado)}
            contexto={item.valorParado}
            acento={copyParados.accent}
            statusBadge={<SeloStatus status={status} />}
          />
        );
      })}
      </ListaCard>
    </>
  );
}
