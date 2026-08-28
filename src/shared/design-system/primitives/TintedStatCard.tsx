"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { springs } from "../motion-variants";

/* ── Card de métrica com cor consistente ────────────────────────────
   Antes existiam duas versões: uma sempre branca (resumo de Vendas) e outra
   que tingia o fundo só em 2 de 3 casos (saúde do Estoque, com "Parados"
   caindo numa exceção que zerava a cor). Aqui a regra é uma só: fundo
   sempre branco, ícone + label + valor sempre coloridos com a cor
   semântica — mesmo peso visual em todo card, sem fundo colorido pesando
   na leitura. Não é o `StatCard` genérico (esse já tem outro dono, o
   painel de consumo de IA) — este é específico pra grades de indicador
   com cor semântica. */

export interface TintedStatCardProps {
  label: ReactNode;
  valor: ReactNode;
  icon: LucideIcon;
  /** Cor semântica do card (CSS var ou cor crua) — tinge fundo, ícone, label e valor. */
  cor: string;
  sub?: ReactNode;
  /** Quando presente, o card vira um botão (usado como filtro clicável). */
  onClick?: () => void;
  ativo?: boolean;
  /** Classe extra na linha do rótulo — usada para reservar uma altura fixa
   *  quando o card convive em grade com outros cujo rótulo pode ou não
   *  quebrar linha, para o valor não nascer em alturas diferentes entre eles. */
  labelClassName?: string;
  /** Texto do `title` nativo — some no toque, então nunca carrega informação
   *  que só exista ali; serve de reforço no desktop para um card cujo destino
   *  ao clique não é óbvio pelo rótulo. */
  dica?: string;
  /** Tique de relógio no fundo: a cor do card enche e esvazia devagar, com
   *  pausa longa entre repetições. Só faz sentido num card que é PORTA para
   *  outra tela e que a pessoa não está procurando — um destaque estático
   *  vira paisagem no segundo dia, e um que se mexe sem parar disputa a
   *  leitura dos números ao lado. */
  pulsar?: boolean;
  /** Encolhe respiro e valor NO CELULAR, voltando ao normal a partir de `sm`.
   *  Serve à grade que precisa caber mais coisa na primeira tela do telefone
   *  sem empurrar o conteúdo principal para baixo da dobra; no desktop, onde
   *  sobra espaço, apertar não traz benefício nenhum. */
  compactoNoMobile?: boolean;
}

export function TintedStatCard({ label, valor, icon: Icon, cor, sub, onClick, ativo, labelClassName, compactoNoMobile, dica, pulsar }: TintedStatCardProps) {
  const reduzir = useReducedMotion();
  const Tag = onClick ? motion.button : motion.div;

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={dica}
      // `ativo` indefinido é o caso do card que ABRE algo em vez de filtrar:
      // sem estado ligado/desligado para anunciar, `aria-pressed` sairia como
      // "não pressionado" e o leitor de tela prometeria um botão de alternar
      // que não existe.
      aria-pressed={onClick && ativo !== undefined ? ativo : undefined}
      whileHover={reduzir || !onClick ? undefined : { y: -4, scale: 1.02 }}
      whileTap={reduzir || !onClick ? undefined : { scale: 0.94 }}
      transition={springs.momentum}
      // w-full/h-full é o que garante o card esticar até preencher a célula
      // do grid/flex em que ele mora — um <button> (usado quando é
      // clicável) não estica sozinho como um <div> estica, ele encolhe pro
      // tamanho do próprio conteúdo por padrão, tanto na largura (vãos
      // entre colunas) quanto na altura (cards de tamanhos desiguais
      // lado a lado quando um tem mais conteúdo que os outros).
      // justify-center: quando um card do grupo tem mais conteúdo que os
      // outros (ex.: "Parados" com legenda em R$ que os outros não têm) e
      // todos esticam pra mesma altura, o bloco fica centralizado em vez de
      // colado no topo com um vão vazio embaixo — informação mais clara em
      // vez de "perdida" numa caixa maior do que ela mesma.
      className={`relative flex h-full w-full flex-col justify-center overflow-hidden rounded-[1.15rem] border-2 text-left shadow-[0_2px_14px_rgba(14,15,19,.06)] transition-[box-shadow,border-color] hover:shadow-[0_10px_28px_rgba(14,15,19,.12)] ${compactoNoMobile ? "p-3 sm:p-4" : "p-4"}`}
      style={{
        borderColor: ativo ? cor : "transparent",
        background: "var(--card)",
      }}
    >
      {pulsar && !reduzir && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: `color-mix(in srgb, ${cor} 9%, transparent)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.4, times: [0, 0.35, 0.7, 1], repeat: Infinity, repeatDelay: 4.4, ease: "easeInOut" }}
        />
      )}

      {/* Pulso de seleção: só quando é clicável e acaba de ativar — anel na
       *  cor do card que nasce colado e se expande sumindo (AnimatePresence
       *  monta uma vez por ativação, não é loop). */}
      {onClick && (
        <AnimatePresence>
          {ativo && !reduzir && (
            <motion.span
              key="halo"
              initial={{ opacity: 0.5, scale: 0.85 }}
              animate={{ opacity: 0, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 rounded-[1.15rem]"
              style={{ border: `2px solid ${cor}` }}
            />
          )}
        </AnimatePresence>
      )}
      <div className={`relative flex items-center gap-2 text-xs font-semibold ${labelClassName ?? ""}`} style={{ color: cor }}>
        <Icon size={15} strokeWidth={1.75} />
        {label}
      </div>
      <p className={`relative font-black tabular-nums ${compactoNoMobile ? "mt-1.5 text-lg sm:mt-2 sm:text-xl" : "mt-2 text-xl"}`} style={{ color: cor }}>{valor}</p>
      {sub && <p className="relative mt-1.5 text-[11px] text-muted-foreground">{sub}</p>}
    </Tag>
  );
}
