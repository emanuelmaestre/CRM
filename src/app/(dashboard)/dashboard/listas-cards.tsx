"use client";

import { motion, AnimatePresence } from "framer-motion";
import { EmptyState, type IllustrationType } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { listItem, springs, stagger } from "@/shared/design-system/motion-variants";
import { getIcon } from "@/shared/config/icon-registry";
import dashboardConfig from "@/config/dashboard.json";
import { Card, CardHead } from "./card-primitives";
import type {
  ProdutoGiroBaixo,
  ProdutoMaisVendido,
  ProdutoParado,
  ProdutoReposicao,
} from "@/modules/relatorios/application/dashboard.service";

/* ── Linha de produto ──────────────────────────────────────────
   Nome e SKU à esquerda, número que importa à direita. O medidor
   opcional dá a proporção sem gastar uma coluna de texto. */
function LinhaProduto({ nome, sku, marca, destaque, destaqueCor, contexto, medidor, acento }: {
  nome: string;
  sku: string;
  marca: string;
  destaque: string;
  destaqueCor?: string;
  contexto: string;
  medidor?: number;
  acento: string;
}) {
  return (
    <motion.li variants={listItem} className="border-b border-border px-5 py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{nome}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{sku} · {marca}</p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className="text-sm font-bold tabular-nums"
            style={{ color: destaqueCor ?? "var(--foreground)" }}
          >
            {destaque}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{contexto}</p>
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
function ListaCard({ titulo, subtitulo, icone, acento, vazio, carregando, semFiltro, ilustracao, vazioTitulo, vazioDescricao, scope, children }: {
  titulo: string;
  subtitulo: string;
  icone: string;
  acento: string;
  vazio: boolean;
  carregando: boolean;
  semFiltro: boolean;
  ilustracao: IllustrationType;
  vazioTitulo: string;
  vazioDescricao: string;
  scope?: React.ReactNode;
  children: React.ReactNode;
}) {
  const Icon = getIcon(icone);
  // Troca de conteúdo é feita por crossfade (AnimatePresence), nunca por
  // desmontar o Card inteiro — é isso que evita o "piscar" ao trocar de
  // filtro. Enquanto uma busca nova está em voo mas já existe conteúdo
  // anterior na tela, ele fica visível e só esmaece um pouco.
  return (
    <Card>
      <CardHead title={titulo} subtitle={subtitulo} icon={Icon} accent={acento} scope={scope} />
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
      titulo={copyVendidos.title}
      subtitulo={copyVendidos.subtitle}
      icone={copyVendidos.icon}
      acento={copyVendidos.accent}
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
          destaque={`${item.quantidade} ${copyVendidos.unitLabel}`}
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
      titulo={copyReposicao.title}
      subtitulo={copyReposicao.subtitle}
      icone={copyReposicao.icon}
      acento={copyReposicao.accent}
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
          destaque={String(item.saldo)}
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
      titulo={copyGiro.title}
      subtitulo={copyGiro.subtitle}
      icone={copyGiro.icon}
      acento={copyGiro.accent}
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
          destaque={item.quantidade === 0
            ? copyGiro.noSaleLabel
            : `${item.quantidade} ${item.quantidade === 1 ? copyGiro.saleLabel : copyGiro.salesLabel}`}
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
      titulo={copyParados.title}
      subtitulo={copyParados.subtitle}
      icone={copyParados.icon}
      acento={copyParados.accent}
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
          destaque={item.diasParado !== null
            ? `${item.diasParado} d`
            : copyParados.neverLabel}
          contexto={`${item.valorParado} ${copyParados.stuckLabel}`}
          acento={copyParados.accent}
        />
      ))}
    </ListaCard>
  );
}
