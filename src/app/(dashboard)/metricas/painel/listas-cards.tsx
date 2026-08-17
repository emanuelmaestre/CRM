"use client";

import { motion, AnimatePresence } from "framer-motion";
import { EmptyState, type IllustrationType } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { listItem, springs, stagger } from "@/shared/design-system/motion-variants";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead, useContagem } from "../metricas-primitives";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import type {
  ProdutoGiroBaixo,
  ProdutoMaisVendido,
  ProdutoParado,
  ProdutoReposicao,
} from "@/modules/metricas/application/dashboard.service";

/* ── Linha de produto ──────────────────────────────────────────
   Nome e SKU à esquerda, número que importa à direita. O medidor
   opcional dá a proporção sem gastar uma coluna de texto. A marca vem
   na cor de identidade dela (mesma usada nos filtros) — assim dá pra
   escanear de qual empresa é cada item sem ler o texto todo. */
function LinhaProduto({ nome, sku, marca, marcaSlug, destaque, destaqueNumerico, formatarDestaque, destaqueLabel, destaqueCor, contexto, medidor, acento }: {
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
  acento: string;
}) {
  const corMarca = isBrandSlug(marcaSlug) ? getBrandConfig(marcaSlug)?.color : undefined;
  const destaqueAnimado = useContagem(destaqueNumerico ?? 0);
  return (
    <motion.li variants={listItem} className="border-b border-border px-5 py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{nome}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span className="text-muted-foreground/70">SKU:</span> {sku} · <span className="font-semibold" style={corMarca ? { color: corMarca } : undefined}>{marca}</span>
          </p>
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
            style={{ transformOrigin: "left", background: acento }}
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

export function ParadosCard({ itens, carregando, semFiltro, scope }: {
  itens: ProdutoParado[] | null;
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
      ilustracao="deadStock"
      vazioTitulo={copyParados.emptyTitle}
      vazioDescricao={copyParados.emptyDescription}
      scope={scope}
    >
      {lista.map((item) => (
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
          destaqueCor={item.diasParado === null ? "var(--muted-foreground)" : undefined}
          contexto={`${item.valorParado} ${copyParados.stuckLabel}`}
          acento={copyParados.accent}
        />
      ))}
    </ListaCard>
  );
}
