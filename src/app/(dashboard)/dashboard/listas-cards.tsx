"use client";

import { motion } from "framer-motion";
import { EmptyState, type IllustrationType } from "@/shared/design-system/primitives/EmptyState";
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

/* ── Casca de card de lista ───────────────────────────────────── */
function ListaCard({ titulo, subtitulo, icone, acento, vazio, ilustracao, vazioTitulo, vazioDescricao, scope, children }: {
  titulo: string;
  subtitulo: string;
  icone: string;
  acento: string;
  vazio: boolean;
  ilustracao: IllustrationType;
  vazioTitulo: string;
  vazioDescricao: string;
  scope?: React.ReactNode;
  children: React.ReactNode;
}) {
  const Icon = getIcon(icone);
  return (
    <Card>
      <CardHead title={titulo} subtitle={subtitulo} icon={Icon} accent={acento} scope={scope} />
      {vazio ? (
        <EmptyState illustration={ilustracao} title={vazioTitulo} description={vazioDescricao} />
      ) : (
        <motion.ul variants={stagger} initial="hidden" animate="show" className="mt-4">
          {children}
        </motion.ul>
      )}
    </Card>
  );
}

/* ── 1. Vendem mais ───────────────────────────────────────────── */
const copyVendidos = dashboardConfig.cards.maisVendidos;

export function MaisVendidosCard({ itens, scope }: { itens: ProdutoMaisVendido[]; scope?: React.ReactNode }) {
  return (
    <ListaCard
      titulo={copyVendidos.title}
      subtitulo={copyVendidos.subtitle}
      icone={copyVendidos.icon}
      acento={copyVendidos.accent}
      vazio={itens.length === 0}
      ilustracao="bestSellers"
      vazioTitulo={copyVendidos.emptyTitle}
      vazioDescricao={copyVendidos.emptyDescription}
      scope={scope}
    >
      {itens.map((item) => (
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

export function ReposicaoCard({ itens, scope }: { itens: ProdutoReposicao[]; scope?: React.ReactNode }) {
  return (
    <ListaCard
      titulo={copyReposicao.title}
      subtitulo={copyReposicao.subtitle}
      icone={copyReposicao.icon}
      acento={copyReposicao.accent}
      vazio={itens.length === 0}
      ilustracao="restock"
      vazioTitulo={copyReposicao.emptyTitle}
      vazioDescricao={copyReposicao.emptyDescription}
      scope={scope}
    >
      {itens.map((item) => (
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

export function GiroBaixoCard({ itens, scope }: { itens: ProdutoGiroBaixo[]; scope?: React.ReactNode }) {
  return (
    <ListaCard
      titulo={copyGiro.title}
      subtitulo={copyGiro.subtitle}
      icone={copyGiro.icon}
      acento={copyGiro.accent}
      vazio={itens.length === 0}
      ilustracao="slowMoving"
      vazioTitulo={copyGiro.emptyTitle}
      vazioDescricao={copyGiro.emptyDescription}
      scope={scope}
    >
      {itens.map((item) => (
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

export function ParadosCard({ itens, scope }: { itens: ProdutoParado[]; scope?: React.ReactNode }) {
  return (
    <ListaCard
      titulo={copyParados.title}
      subtitulo={copyParados.subtitle}
      icone={copyParados.icon}
      acento={copyParados.accent}
      vazio={itens.length === 0}
      ilustracao="deadStock"
      vazioTitulo={copyParados.emptyTitle}
      vazioDescricao={copyParados.emptyDescription}
      scope={scope}
    >
      {itens.map((item) => (
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
