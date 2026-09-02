"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PlugZap2 } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import {
  getBrandConfig,
  isBrandSlug,
  marcaDisponivelNosCanais,
} from "@/shared/config/brands";
import channelsConfig from "@/config/channels.json";

export type ScopeMarca = { brandId: string; nome: string; slug: string; total: number };
export type ScopeCanal = { tipo: string; total: number; conectado: boolean };
export type CardFiltro = { brandId: string[]; canal: string[] };

function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];
}

function canalLabel(tipo: string) {
  return (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;
}

// Mesmo halo (pisca uma vez e some) usado em Vendas/Estoque/Clientes/
// Publicidade — antes este arquivo tinha uma versão própria, um anel que
// respirava sem parar enquanto a pílula ficava selecionada.
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

function Pilula({ ativo, desabilitado, motivoDesabilitado, onClick, rotulo, accent, children }: {
  ativo: boolean;
  desabilitado?: boolean;
  motivoDesabilitado?: string;
  onClick: () => void;
  rotulo?: string;
  /** Cor de identidade (marca ou canal) usada quando selecionado — cada pílula
   *  tinge com a própria cor em vez de todas ficarem roxas. */
  accent?: string;
  children: React.ReactNode;
}) {
  const reduzMovimento = useReducedMotion();
  return (
    <motion.button
      type="button"
      // Continua tocável mesmo desabilitada — o toque mostra o motivo (toast),
      // porque `title` (tooltip) não aparece no toque em celular; mesmo
      // padrão de Estoque/Publicidade.
      onClick={desabilitado ? () => toast.info(motivoDesabilitado ?? `${rotulo ?? "Este canal"} ainda não está conectado.`) : onClick}
      aria-disabled={desabilitado}
      aria-pressed={ativo}
      aria-label={rotulo}
      title={desabilitado ? motivoDesabilitado ?? rotulo : rotulo}
      whileHover={!reduzMovimento ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!reduzMovimento ? { scale: desabilitado ? 0.97 : 0.92 } : undefined}
      style={ativo && !desabilitado && accent ? { borderColor: accent } : undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-card/70 px-3.5 transition-colors text-[13px] font-semibold ${
        desabilitado
          ? "border border-border text-muted-foreground opacity-50"
          : ativo
            ? "border-2 font-bold"
            : "border border-border/80 bg-card/40 text-muted-foreground hover:bg-card/70"
      }`}
    >
      <HaloSelecao ativo={ativo && !desabilitado && Boolean(accent)} cor={accent ?? "var(--foreground)"} reduzir={reduzMovimento} />
      {children}
      {desabilitado && <PlugZap2 size={14} className="text-muted-foreground" />}
    </motion.button>
  );
}

/* ── Filtro de card, sempre visível ───────────────────────────────
   Cada card filtra de forma independente — as pílulas de marca/canal
   ficam expostas numa fileira compacta abaixo do cabeçalho, sem clique
   escondido atrás de um botão. Fecha em "Todas as marcas"/"Todos os
   canais" quando nada está marcado. */
export function ScopeRow({ marcas, canais, filtro, onChange }: {
  marcas: ScopeMarca[];
  canais: ScopeCanal[];
  filtro: CardFiltro;
  onChange: (filtro: CardFiltro) => void;
}) {
  if (marcas.length === 0 && canais.length === 0) return null;

  function alternarCanal(tipo: string) {
    const proximosCanais = alternar(filtro.canal, tipo);
    // O canal não acende empresa nenhuma — cada pílula liga e desliga só a si
    // mesma. Mas ainda poda: empresa que não opera no canal escolhido sairia
    // marcada por trás de uma pílula travada, sem como desmarcar.
    const proximasMarcas = filtro.brandId.filter((id) => {
      const marca = marcas.find((m) => m.brandId === id);
      return !marca || marcaDisponivelNosCanais(marca.slug, proximosCanais);
    });
    onChange({ brandId: proximasMarcas, canal: proximosCanais });
  }

  function alternarMarca(marca: ScopeMarca) {
    onChange({ ...filtro, brandId: alternar(filtro.brandId, marca.brandId) });
  }

  // No mobile, marca e canal já quebravam em duas fileiras por falta de
  // espaço (empresas em cima, canais embaixo) — formaliza isso em dois
  // grupos de verdade (em vez de uma sequência só) pra poder inverter a
  // ordem visual só ali (canal em cima, empresa embaixo) com `order`, sem
  // mudar nada no desktop: `sm:contents` desfaz o agrupamento a partir do
  // sm, voltando pra sequência única de sempre dentro do AcaoSlotFiltro. */
  // Ordem DIFERENTE por tamanho de tela, e isto é de propósito — pedido de
  // 02/09/2026. Na fileira única do desktop as empresas vêm primeiro
  // (Armarinhos Lima · Karzi · Wuwu, já ordenadas assim em `marcas` por
  // `compararPorOrdemDeMarca`) e os canais depois; no celular, onde cada
  // grupo ocupa a própria linha, a leitura de sempre é mantida — canal em
  // cima, empresa embaixo.
  //
  // Como isso funciona: `sm:contents` dissolve os wrappers a partir do sm, e
  // aí quem manda é a ordem do DOM — por isso o grupo de MARCAS vem escrito
  // primeiro aqui embaixo. Abaixo do sm os wrappers voltam a ser itens de
  // flex e o `order-1`/`order-2` devolve a ordem do celular.
  //
  // Um comentário anterior tratava exatamente esta divergência entre desktop
  // e mobile como defeito e a eliminou. Ela voltou por pedido explícito: se
  // for pra unificar de novo, é decisão de produto, não faxina de código.
  return (
    <>
      <div className="order-2 flex flex-wrap items-center justify-center gap-2 sm:order-none sm:contents">
        {marcas.map((marca) => {
          const disponivel = marcaDisponivelNosCanais(marca.slug, filtro.canal);
          return (
            <Pilula
              key={marca.brandId}
              ativo={disponivel && filtro.brandId.includes(marca.brandId)}
              desabilitado={!disponivel}
              motivoDesabilitado={`${marca.nome} não opera nos canais selecionados.`}
              rotulo={marca.nome}
              onClick={() => alternarMarca(marca)}
              accent={isBrandSlug(marca.slug) ? getBrandConfig(marca.slug)?.color : undefined}
            >
              {isBrandSlug(marca.slug) ? <BrandLogo brand={marca.slug} height={17} /> : marca.nome}
            </Pilula>
          );
        })}
      </div>

      <div className="order-1 flex flex-wrap items-center justify-center gap-2 sm:order-none sm:contents">
        {canais.map((canal) => (
          <Pilula
            key={canal.tipo}
            ativo={filtro.canal.includes(canal.tipo)}
            desabilitado={!canal.conectado}
            onClick={() => alternarCanal(canal.tipo)}
            rotulo={canalLabel(canal.tipo)}
            accent={channelAccent(canal.tipo)}
          >
            <ChannelLogo canal={canal.tipo} size="sm" variant="logo" />
          </Pilula>
        ))}
      </div>
    </>
  );
}
