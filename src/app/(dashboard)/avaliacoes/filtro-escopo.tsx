"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PlugZap2 } from "lucide-react";
import { toast } from "sonner";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { getBrandConfig, isBrandSlug, BRAND_SLUGS } from "@/shared/config/brands";
import channelsConfig from "@/config/channels.json";

export const CANAIS_VENDA = ["mercadolivre", "shopee", "tiktokshop"] as const;

/** Anel na cor da pílula que nasce colado nela e se expande sumindo — só
 *  toca quando `ativo` PASSA a ser true. Mesmo componente usado em Estoque/
 *  Publicidade, pro selecionar de marca/canal ter a mesma linguagem visual
 *  em todo o app. */
function HaloSelecao({ ativo, cor, reduzir }: { ativo: boolean; cor: string; reduzir: boolean | null }) {
  return (
    <AnimatePresence>
      {ativo && !reduzir && (
        <motion.span
          key="halo"
          initial={{ opacity: 0.55, scale: 0.82 }}
          animate={{ opacity: 0, scale: 1.4 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: `2px solid ${cor}` }}
        />
      )}
    </AnimatePresence>
  );
}

function EmpresaPill({ nome, slug, total, ativo, onClick }: {
  nome: string; slug: string; total: number; ativo: boolean; onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const temIdentidade = isBrandSlug(slug);
  const cor = getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
  // Mesma regra de Vendas/Estoque/Clientes: marca sem nenhuma avaliação
  // fica travada (com o motivo à vista), a não ser que já esteja marcada —
  // aí continua clicável só pra dar pra desmarcar.
  const vazia = total === 0;
  const bloqueada = vazia && !ativo;
  return (
    <motion.button
      type="button"
      onClick={bloqueada ? undefined : onClick}
      disabled={bloqueada}
      aria-pressed={ativo}
      aria-label={nome}
      title={bloqueada ? `${nome} não tem avaliações no período.` : undefined}
      whileHover={!bloqueada && !reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.92 } : undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: cor } : undefined}
    >
      <HaloSelecao ativo={ativo} cor={cor} reduzir={reduzir} />
      {temIdentidade ? <BrandLogo brand={slug} height={17} /> : <span className="text-sm font-semibold text-foreground">{nome}</span>}
    </motion.button>
  );
}

// Avaliações existe pra Mercado Livre e Shopee — a API do TikTok Shop ainda
// não foi integrada (nem a conexão de canal em si). TikTok aparece travado
// ("ainda não disponível", mesmo padrão de Publicidade) em vez de sumir,
// pra deixar claro que a tela é sobre canais de venda, só que esse canal
// específico ainda não dá pra filtrar — não é sobre a conta estar
// desconectada, como em Vendas/Estoque/Clientes.
function CanalFiltroPill({ tipo, ativo, onClick }: {
  tipo: string; ativo: boolean; onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const disponivel = tipo === "mercadolivre" || tipo === "shopee";
  const label = (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;
  const cor = channelAccent(tipo);
  return (
    <motion.button
      type="button"
      // Continua tocável mesmo indisponível — o toque mostra o motivo
      // (toast), porque `title` (tooltip) não aparece no toque em celular.
      onClick={disponivel ? onClick : () => toast.info(`Avaliações de ${label} ainda não estão disponíveis.`)}
      aria-disabled={!disponivel}
      aria-pressed={ativo}
      aria-label={disponivel ? label : `${label} — ainda não disponível`}
      title={disponivel ? label : `Avaliações de ${label} ainda não estão disponíveis`}
      whileHover={!reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!reduzir ? { scale: disponivel ? 0.92 : 0.97 } : undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        !disponivel
          ? "border border-border opacity-50"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={disponivel && ativo ? { borderColor: cor } : undefined}
    >
      <HaloSelecao ativo={disponivel && ativo} cor={cor} reduzir={reduzir} />
      <ChannelLogo canal={tipo} size="sm" variant="logo" />
      {!disponivel && <PlugZap2 size={14} className="text-muted-foreground" />}
    </motion.button>
  );
}

type FiltroEscopoProps = {
  marcasAtivas: ReadonlySet<string>;
  canaisAtivos: ReadonlySet<string>;
  onToggleMarca: (slug: string) => void;
  onToggleCanal: (tipo: string) => void;
  contagemMarca: Record<string, number>;
};

export function EmpresasRow({ marcasAtivas, onToggleMarca, contagemMarca }: Pick<FiltroEscopoProps, "marcasAtivas" | "onToggleMarca" | "contagemMarca">) {
  return (
    <div className="flex flex-nowrap items-center gap-2 w-fit">
      {BRAND_SLUGS.map((slug) => (
        <EmpresaPill
          key={slug}
          nome={getBrandConfig(slug)?.label ?? slug}
          slug={slug}
          total={contagemMarca[slug] ?? 0}
          ativo={marcasAtivas.has(slug)}
          onClick={() => onToggleMarca(slug)}
        />
      ))}
    </div>
  );
}

export function CanaisRow({ canaisAtivos, onToggleCanal }: Pick<FiltroEscopoProps, "canaisAtivos" | "onToggleCanal">) {
  return (
    <div className="flex flex-nowrap items-center gap-2 w-fit">
      {CANAIS_VENDA.map((tipo) => (
        <CanalFiltroPill
          key={tipo}
          tipo={tipo}
          ativo={canaisAtivos.has(tipo)}
          onClick={() => onToggleCanal(tipo)}
        />
      ))}
    </div>
  );
}

/** Barra de escopo Empresa/Canal do módulo Avaliações. Já foi compartilhada
 *  com as abas Conversas/Perguntas do Inbox — essas duas telas não existem
 *  mais no app, então hoje isso é usado só aqui. Usada como uma linha só a
 *  partir do breakpoint lg; abaixo disso a tela monta EmpresasRow/CanaisRow
 *  separadas, empilhadas, porque numa tela estreita as duas listas de
 *  pílulas não cabem lado a lado sem empurrar uma pra fora da viewport.
 *  Canal primeiro, empresa depois — mesma ordem fixa do resto do sistema
 *  (ver comentário em scope-row.tsx) e a mesma que o mobile desta tela
 *  já usava (ver avaliacoes-cliente.tsx); antes só a versão desktop
 *  invertia. */
export function FiltroEscopoBar(props: FiltroEscopoProps) {
  return (
    <div className="flex flex-nowrap items-center gap-2 w-fit">
      <CanaisRow canaisAtivos={props.canaisAtivos} onToggleCanal={props.onToggleCanal} />
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
      <EmpresasRow marcasAtivas={props.marcasAtivas} onToggleMarca={props.onToggleMarca} contagemMarca={props.contagemMarca} />
    </div>
  );
}
