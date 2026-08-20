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
              <EmptyState illustration={ilustracao} title="Selecione um filtro" description="Escolha uma marca ou canal acima para ver os dados deste card." />
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

export function MaisVendidosCard({ itens, carregando, semFiltro, scope }: {
  itens: ProdutoMaisVendido[] | null;
  carregando: boolean;
  semFiltro: boolean;
  scope?: React.ReactNode;
}) {
  const lista = itens ?? [];
  return (
    <ListaCard
      vazio={lista.length === 0}
      carregando={carregando}
      semFiltro={semFiltro}
      ilustracao="bestSellers"
      vazioTitulo={copyVendidos.emptyTitle}
      vazioDescricao={copyVendidos.emptyDescription}
      scope={scope}
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
          medidor={item.participacao}
          acento={copyVendidos.accent}
        />
      ))}
    </ListaCard>
  );
}

/* ── 2. Repor em breve ────────────────────────────────────────── */
const copyReposicao = dashboardConfig.cards.reposicao;

export function ReposicaoCard({ itens, carregando, semFiltro, scope }: {
  itens: ProdutoReposicao[] | null;
  carregando: boolean;
  semFiltro: boolean;
  scope?: React.ReactNode;
}) {
  const lista = itens ?? [];
  return (
    <ListaCard
      vazio={lista.length === 0}
      carregando={carregando}
      semFiltro={semFiltro}
      ilustracao="restock"
      vazioTitulo={copyReposicao.emptyTitle}
      vazioDescricao={copyReposicao.emptyDescription}
      scope={scope}
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
          medidor={item.urgencia}
          acento={copyReposicao.accent}
        />
      ))}
    </ListaCard>
  );
}

/* ── 3. Giro baixo ────────────────────────────────────────────── */
const copyGiro = dashboardConfig.cards.giroBaixo;

export function GiroBaixoCard({ itens, carregando, semFiltro, scope }: {
  itens: ProdutoGiroBaixo[] | null;
  carregando: boolean;
  semFiltro: boolean;
  scope?: React.ReactNode;
}) {
  const lista = itens ?? [];
  return (
    <ListaCard
      vazio={lista.length === 0}
      carregando={carregando}
      semFiltro={semFiltro}
      ilustracao="slowMoving"
      vazioTitulo={copyGiro.emptyTitle}
      vazioDescricao={copyGiro.emptyDescription}
      scope={scope}
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
        />
      ))}
    </ListaCard>
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
      hint: `Publicado e visível no Mercado Livre, mas sem nenhuma venda ${tempo}: o anúncio está no ar, só não vende.`,
    },
    pausado: {
      label: "Pausado",
      className: "bg-warning/10 text-warning",
      hint: `Este anúncio está pausado no Mercado Livre${motivo}, por isso não aparece pra compra, o que já explica por que não vende ${tempo}.`,
    },
    encerrado: {
      label: "Encerrado no ML",
      className: "bg-destructive/10 text-destructive",
      hint: `Este anúncio não existe mais no Mercado Livre${motivo}, mas o produto continua no catálogo com ${item.saldo} unidade${item.saldo === 1 ? "" : "s"} em estoque: ninguém consegue comprar por lá.`,
    },
    sem_vinculo: {
      label: "Sem vínculo com o ML",
      className: "bg-info/10 text-info",
      hint: "Não encontramos nenhum anúncio deste produto vinculado a uma conta do Mercado Livre, o vínculo pode ter se perdido.",
    },
    nao_consultado: {
      label: "Status indisponível",
      className: "bg-muted text-muted-foreground",
      hint: "Não foi possível confirmar agora o status deste anúncio no Mercado Livre (falha temporária na consulta), o restante do dado continua confiável.",
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
const LEGENDA_STATUS: Array<{ titulo: string; texto: string; cor: string }> = [
  { titulo: "Ativo no ML", cor: "var(--success)", texto: "O anúncio está publicado e visível no Mercado Livre, só não vende: não é um problema técnico." },
  { titulo: "Pausado", cor: "var(--warning)", texto: "Você mesmo pausou o anúncio, ele não vender é esperado: ninguém consegue comprar algo pausado." },
  { titulo: "Encerrado no ML", cor: "var(--destructive)", texto: "O anúncio não existe mais lá, mas o produto continua no catálogo do CRM com saldo: ninguém consegue comprar por nenhum canal." },
  { titulo: "Sem vínculo com o ML", cor: "var(--info)", texto: "Não achamos nenhum anúncio deste produto ligado a uma conta do Mercado Livre, o vínculo pode ter se perdido." },
  { titulo: "Status indisponível", cor: "var(--muted-foreground)", texto: "Falha temporária ao consultar o Mercado Livre agora, o resto do dado (saldo, dias parado) continua confiável." },
];

function EntendaStatusBotao() {
  return (
    <AnimatedInfoPopover
      trigger={(
        <AnimatedInfoTrigger
          title="Entenda os status do anúncio no Mercado Livre"
          iconSize={13}
          className="press-feedback inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          Entenda os status
        </AnimatedInfoTrigger>
      )}
      align="end"
      sideOffset={8}
      collisionPadding={12}
      // No desktop o popover fica mais largo e os 5 status se dividem em 2
      // colunas — no mobile continua empilhado (não tem largura de sobra).
      className="z-[100] w-[min(22rem,calc(100vw-1.5rem))] rounded-[1.1rem] border border-border bg-card p-5 shadow-[0_16px_40px_rgba(14,15,19,.24)] sm:w-[min(30rem,calc(100vw-1.5rem))]"
    >
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">Status do anúncio no ML</p>
      <dl className="mt-3 flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
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
    <ListaCard
      vazio={lista.length === 0}
      carregando={carregando}
      semFiltro={semFiltro}
      ilustracao="deadStock"
      vazioTitulo={copyParados.emptyTitle}
      vazioDescricao={copyParados.emptyDescription}
      scope={scope}
    >
      {acaoSlot && createPortal(<EntendaStatusBotao />, acaoSlot)}
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
            statusBadge={(
              <AnimatedInfoPopover
                trigger={(
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => event.stopPropagation()}
                    className={`press-feedback cursor-pointer rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-80 ${status.className}`}
                  >
                    {status.label}
                  </span>
                )}
                align="start"
                sideOffset={6}
                collisionPadding={12}
                className="z-[100] w-64 rounded-xl border border-border bg-card p-3 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
              >
                <p className="text-[12px] leading-relaxed text-foreground/85">{status.hint}</p>
              </AnimatedInfoPopover>
            )}
          />
        );
      })}
    </ListaCard>
  );
}
