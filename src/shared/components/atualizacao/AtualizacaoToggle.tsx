"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle, Check, Database, Megaphone, Package, RefreshCw,
  ShoppingCart, Star, ThumbsUp, X,
} from "lucide-react";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { GenericIllustration } from "@/shared/design-system/primitives/illustrations";
import { springs, transicao } from "@/shared/design-system/motion-variants";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { useAtualizacao } from "./atualizacao-contexto";
import type { PainelAtualizacao, TelaAtualizavel } from "@/modules/canais/application/painel-atualizacao.service";
import type { ModuloSincronizacao } from "@/modules/canais/domain/sincronizacao-progresso";

const ROTULO_MODULO: Record<ModuloSincronizacao, string> = {
  catalogo: "Catálogo e estoque",
  pedidos: "Pedidos",
  anuncios: "Anúncios",
  avaliacoes: "Avaliações",
  reputacao: "Reputação",
};

/** Um ícone por tipo de dado. Quem não é da área reconhece o desenho antes
 *  de ler a palavra — e é o mesmo vocabulário visual do menu lateral, então
 *  "carrinho = pedidos" já vem aprendido de outra tela. */
const ICONE_MODULO: Record<ModuloSincronizacao, typeof ShoppingCart> = {
  catalogo: Package,
  pedidos: ShoppingCart,
  anuncios: Megaphone,
  avaliacoes: Star,
  reputacao: ThumbsUp,
};

/** Uma frase por tipo de dado, em português comum: o que a pessoa ganha ao
 *  mandar buscar aquilo. Nada de "sincronizar módulo" — diz o que muda na
 *  tela dela. */
const EXPLICACAO_MODULO: Record<ModuloSincronizacao, string> = {
  catalogo: "Quanto você tem de cada produto à venda no canal.",
  pedidos: "Vendas novas, pagamentos e mudanças de entrega.",
  anuncios: "Quanto seus anúncios pagos gastaram e renderam.",
  avaliacoes: "Estrelas e comentários que os clientes deixaram.",
  reputacao: "Sua nota de vendedor e reclamações no canal.",
};

/** Nome da tela como a pessoa a conhece no menu. O painel é sempre da tela
 *  em que ela está — dizer qual é, por extenso, é o que faltava para não
 *  parecer que ali se mistura dado de outros módulos. */
const ROTULO_TELA: Record<TelaAtualizavel, string> = {
  vendas: "Vendas",
  avaliacoes: "Avaliações",
  estoque: "Estoque",
  metricas: "Métricas",
  anuncios: "Publicidade",
  configuracoes: "Configurações",
  clientes: "Clientes",
  importacao: "Importação",
  auditoria: "Auditoria",
};

const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});
const dataCompleta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
});

/** "agora", "há 4 min", "há 2 h", "12/08 10:42" — a idade do dado dita a
 *  precisão. Hora cheia não diz nada sobre algo de três dias atrás, e data
 *  completa é ruído para algo de dois minutos. */
function idade(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  if (ms < 60_000) return "agora";
  if (ms < 3_600_000) return `há ${Math.floor(ms / 60_000)} min`;
  if (ms < 21_600_000) return `há ${Math.floor(ms / 3_600_000)} h`;
  if (ms < 86_400_000) return hora.format(new Date(iso));
  return dataHora.format(new Date(iso));
}

/** Data e hora por extenso, com "hoje"/"ontem" quando cabe: "hoje às 14:13".
 *  O relativo ("há 8 min") responde "está fresco?"; este responde "de quando
 *  exatamente?" — as duas perguntas aparecem juntas no painel de propósito. */
function quandoExato(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  const dia = dataCompleta.format(data);
  const agora = new Date();
  const hojeLabel = dataCompleta.format(agora);
  const ontemLabel = dataCompleta.format(new Date(agora.getTime() - 86_400_000));
  const prefixo = dia === hojeLabel ? "hoje" : dia === ontemLabel ? "ontem" : dia;
  return `${prefixo} às ${hora.format(data)}`;
}

function corDoStatus(status: "pendente" | "em_andamento" | "concluido" | "erro") {
  if (status === "erro") return "var(--destructive)";
  if (status === "concluido") return "var(--success)";
  if (status === "em_andamento") return "var(--info)";
  return "var(--muted-foreground)";
}

/* ── Anel de progresso ──────────────────────────────────────────────────
   Arco em SVG, não conic-gradient: o traço interpola de verdade entre dois
   valores, então 40% → 64% desliza em vez de saltar. Parado, o anel fica
   num traço fino de contorno — antes ficava um círculo cheio verde, que
   lia como "100%" o tempo todo e não informava nada. */
function Anel({ progresso, cor, ativo, children }: {
  progresso: number;
  cor: string;
  ativo: boolean;
  children: React.ReactNode;
}) {
  const reduzir = useReducedMotion();
  const raio = 12;
  const volta = 2 * Math.PI * raio;
  return (
    <span className="relative grid h-7 w-7 shrink-0 place-items-center">
      <svg viewBox="0 0 28 28" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="14" cy="14" r={raio} fill="none" stroke="var(--border)" strokeWidth={ativo ? 2.5 : 1.5} />
        {ativo && (
          <motion.circle
            cx="14" cy="14" r={raio} fill="none" stroke={cor} strokeWidth={2.5} strokeLinecap="round"
            strokeDasharray={volta}
            initial={false}
            animate={{ strokeDashoffset: volta * (1 - progresso / 100) }}
            transition={transicao(reduzir, springs.settle)}
          />
        )}
      </svg>
      <span className="relative grid h-full w-full place-items-center">{children}</span>
    </span>
  );
}

function LinhaProgresso({ valor, cor }: { valor: number; cor: string }) {
  const reduzir = useReducedMotion();
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <motion.div
        className="h-full rounded-full"
        style={{ background: cor }}
        initial={false}
        animate={{ width: `${valor}%` }}
        transition={transicao(reduzir, springs.settle)}
      />
    </div>
  );
}

export function AtualizacaoToggle({ modo }: { modo: "desktop" | "mobile" }) {
  const {
    tela, painel, primeiraCarga, desatualizado, atualizandoLocal, contaDisparando,
    atualizarSomenteTela, verificarConta,
  } = useAtualizacao();
  const reduzir = useReducedMotion();
  const [aberto, setAberto] = useState(false);
  // Guarda só a escolha explícita da pessoa. O módulo em uso é derivado
  // disso — sincronizar via efeito fazia um render em cascata a cada
  // chegada de painel, sem necessidade.
  const [moduloEscolhido, setModulo] = useState<ModuloSincronizacao | null>(null);
  const modulo = moduloEscolhido && painel?.modulosDisponiveis.includes(moduloEscolhido)
    ? moduloEscolhido
    : painel?.modulosDisponiveis[0] ?? null;

  // Os textos são relativos ("há 4 min"); sem um tique lento eles congelam
  // enquanto o painel fica aberto.
  const [, forcarRelogio] = useState(0);

  useEffect(() => {
    if (!aberto) return;
    const timer = window.setInterval(() => forcarRelogio((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, [aberto]);

  const emAndamento = painel?.emAndamento ?? false;
  const progresso = painel?.progresso ?? 0;
  const falhas = painel?.falhas ?? [];
  const referencia = painel?.versao ?? painel?.ultimaConcluida ?? null;

  const cor = primeiraCarga
    ? "var(--muted-foreground)"
    : falhas.length > 0 && !emAndamento
    ? "var(--destructive)"
    : emAndamento
    ? "var(--info)"
    : "var(--success)";

  /* Rótulo de largura fixa. Antes o texto ia de "Consultando" a "Atualizado
     10:42", e o cabeçalho inteiro se deslocava a cada troca de estado — o
     que o próprio plano proibia. */
  const rotulo = primeiraCarga ? "—" : emAndamento ? `${progresso}%` : idade(referencia);

  const contasVisiveis = useMemo(() => (
    painel?.contas.filter((conta) => modulo && conta.modulosDisponiveis.includes(modulo)) ?? []
  ), [painel, modulo]);

  if (!tela) return null;

  return (
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={emAndamento
            ? `Atualização em ${progresso} por cento`
            : referencia ? `Dados atualizados ${idade(referencia)}` : "Atualizações"}
          /* Contorno e fundo próprios: antes era só um ícone solto de cor
             apagada, que não lia como algo clicável. A borda ganha a cor do
             estado (verde/vermelho/azul) — o botão vira o próprio indicador,
             visível de relance sem precisar ler o texto. */
          className="press-feedback inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-card px-2 font-semibold text-foreground shadow-[0_1px_2px_rgba(14,15,19,.06)] transition-colors hover:bg-muted sm:gap-2 sm:px-2.5"
          style={{ borderColor: primeiraCarga ? "var(--border)" : `color-mix(in srgb, ${cor} 45%, var(--border))` }}
        >
          <Anel progresso={progresso} cor={cor} ativo={emAndamento}>
            {falhas.length > 0 && !emAndamento
              ? <AlertTriangle size={13} style={{ color: cor }} />
              : emAndamento
              ? <motion.span
                  className="block h-1.5 w-1.5 rounded-full"
                  style={{ background: cor }}
                  animate={reduzir ? undefined : { opacity: [1, 0.25, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              : <Check size={13} strokeWidth={2.8} style={{ color: cor }} />}
          </Anel>
          {/* Slot de largura fixa: o conteúdo muda, o cabeçalho não anda.
              Enquanto o painel exibido ainda é o da rota anterior, o rótulo
              fica esmaecido em vez de sumir — o valor continua verdadeiro,
              só não foi confirmado para esta tela ainda. Aparece a partir de
              `sm` (antes só em `lg`): no tablet sobrava espaço de sobra e a
              informação mais útil do botão ficava escondida à toa. */}
          <span
            className="hidden w-[3.75rem] text-left text-[11px] tabular-nums transition-opacity sm:block lg:w-[4.25rem]"
            style={{ opacity: desatualizado ? 0.5 : 1 }}
          >
            <span className="block truncate">{rotulo}</span>
          </span>
        </button>
      </Dialog.Trigger>

      <AnimatePresence>
        {aberto && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] md:bg-black/10"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={transicao(reduzir, { duration: 0.18 })}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                /* Mobile: gaveta ancorada ACIMA da BottomNav (que é fixa em
                   bottom-0 com safe-area + 14px). Antes ficava em bottom-2 e
                   cobria a navegação — o plano pedia explicitamente que não
                   cobrisse controle essencial. */
                className="fixed inset-x-2 bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] z-50 flex max-h-[min(34rem,calc(100dvh-8rem))] flex-col overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-[0_24px_60px_rgba(0,0,0,.3)] outline-none md:inset-x-auto md:bottom-auto md:right-3 md:top-[3.75rem] md:w-[25.5rem] md:max-h-[min(38rem,calc(100dvh-5rem))]"
                initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
                transition={transicao(reduzir, springs.drawer)}
              >
                {/* Puxador — só mobile, sinaliza que é uma gaveta */}
                <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border md:hidden" />

                <header className="flex items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-3">
                  <div className="min-w-0">
                    {/* O nome da tela no título, não só "Atualizações": o
                        painel sempre foi só desta tela, mas isso nunca estava
                        escrito em lugar nenhum — dava a impressão de ser um
                        painel global do sistema. */}
                    <Dialog.Title className="flex flex-wrap items-center gap-x-1.5 text-sm font-bold text-foreground">
                      Atualizações
                      {tela && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}
                        >
                          {ROTULO_TELA[tela]}
                        </span>
                      )}
                    </Dialog.Title>
                    <p aria-live="polite" className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {primeiraCarga
                        ? "Carregando…"
                        : emAndamento
                        ? `Buscando dados novos agora · ${progresso}%`
                        : referencia
                        ? <>Você está vendo os dados de <strong className="font-bold text-foreground">{quandoExato(referencia) ?? dataHora.format(new Date(referencia))}</strong></>
                        : "Nenhum dado buscado ainda"}
                    </p>
                  </div>
                  <Dialog.Close asChild>
                    <button type="button" aria-label="Fechar" className="press-feedback -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                  {/* Barra grande só enquanto há algo rodando. Parada em 100%
                      permanente, ela era só ruído. */}
                  <AnimatePresence initial={false}>
                    {emAndamento && (
                      <motion.section
                        aria-label="Atividades em andamento"
                        initial={reduzir ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        transition={transicao(reduzir, springs.settleFast)}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-1" role="progressbar" aria-label="Progresso geral" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso}>
                            <LinhaProgresso valor={progresso} cor={cor} />
                          </div>
                          <span className="w-10 text-right text-sm font-black tabular-nums text-foreground">{progresso}%</span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {painel?.contas.flatMap((conta) => conta.execucao?.emAndamento
                            ? conta.execucao.modulos.map((item) => (
                                <motion.div
                                  key={`${conta.id}-${item.modulo}`}
                                  layout={!reduzir}
                                  className="rounded-xl bg-muted/50 px-3 py-2.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">
                                      {item.label} · {conta.brandLabel}
                                    </span>
                                    <span className="shrink-0 text-[11px] font-black tabular-nums" style={{ color: corDoStatus(item.status) }}>
                                      {item.progresso}%
                                    </span>
                                  </div>
                                  <div className="mt-2">
                                    <LinhaProgresso valor={item.progresso} cor={corDoStatus(item.status)} />
                                  </div>
                                </motion.div>
                              ))
                            : [])}
                        </div>
                        <hr className="mt-4 border-border" />
                      </motion.section>
                    )}
                  </AnimatePresence>

                  <button
                    type="button"
                    onClick={atualizarSomenteTela}
                    disabled={atualizandoLocal}
                    className="press-feedback mt-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2.5">
                      <Database size={16} className="shrink-0 text-muted-foreground" />
                      {/* "Só o banco local · sem Webshare" não dizia nada para
                          quem não é da área. O que importa: é rápido e não
                          gasta consulta nos canais. */}
                      <span>
                        <strong className="block text-xs font-bold text-foreground">Recarregar esta tela</strong>
                        <small className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                          Rápido. Mostra o que já foi salvo, sem consultar os canais.
                        </small>
                      </span>
                    </span>
                    <motion.span
                      animate={atualizandoLocal && !reduzir ? { rotate: 360 } : { rotate: 0 }}
                      transition={atualizandoLocal ? { duration: 0.9, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
                      className="shrink-0 text-muted-foreground"
                    >
                      <RefreshCw size={14} />
                    </motion.span>
                  </button>

                  {falhas.length > 0 && (
                    <motion.div
                      initial={reduzir ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={transicao(reduzir, springs.settleFast)}
                      className="mt-4 rounded-xl border border-destructive/25 bg-destructive/[0.07] px-3 py-3"
                    >
                      {falhas.map((falha) => (
                        <div key={falha.contaId} className="flex gap-2.5">
                          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
                          <div className="min-w-0 text-[11px] leading-relaxed">
                            <p className="font-bold text-destructive">
                              {falha.canalLabel} não respondeu · {falha.brandLabel}
                            </p>
                            <p className="mt-0.5 text-muted-foreground">
                              {falha.ultimoDadoBom
                                ? <>Fique tranquilo: nada foi perdido. Você está vendo os dados de {quandoExato(falha.ultimoDadoBom) ?? idade(falha.ultimoDadoBom)}.</>
                                : <>Este canal ainda não trouxe nenhum dado.</>}
                            </p>
                            {falha.erro && <p className="mt-1 truncate text-muted-foreground/80" title={falha.erro}>{falha.erro}</p>}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {painel?.podeSincronizar && (painel.modulosDisponiveis.length ?? 0) > 0 && (
                    <section className="mt-4 border-t border-border pt-4">
                      {/* Antes: "Verificar canal agora" + "Ação explícita e
                          incremental". Agora o título diz de quem é o dado
                          (esta tela) e a frase explica, sem jargão, o que o
                          botão faz e que nada some enquanto isso. */}
                      <p className="text-[11px] font-bold uppercase tracking-[.07em] text-muted-foreground">
                        De onde {tela ? ROTULO_TELA[tela] : "esta tela"} tira os dados
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {painel.modulosDisponiveis.length > 1
                          ? <>Esta tela usa <strong className="font-bold text-foreground">{painel.modulosDisponiveis.length} tipos de dado</strong>. Escolha um e busque o que mudou direto no canal.</>
                          : <>Busque no canal o que mudou desde a última vez.</>}
                        {" "}O que já está na tela continua aparecendo enquanto isso.
                      </p>

                      {painel.modulosDisponiveis.length > 1 && (
                        <div className="scrollbar-none mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
                          {painel.modulosDisponiveis.map((item) => {
                            const ativo = modulo === item;
                            const Icone = ICONE_MODULO[item];
                            return (
                              <button
                                key={item}
                                type="button"
                                onClick={() => setModulo(item)}
                                aria-pressed={ativo}
                                className="press-feedback relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold transition-colors"
                              >
                                {ativo && (
                                  <motion.span
                                    layoutId={`modulo-ativo-${modo}`}
                                    className="absolute inset-0 rounded-full bg-primary"
                                    transition={transicao(reduzir, springs.settleFast)}
                                  />
                                )}
                                {/* Ícone junto do nome: quem bate o olho
                                    identifica "carrinho = pedidos" sem ler. */}
                                <Icone size={12} strokeWidth={2.4} className={`relative shrink-0 ${ativo ? "text-primary-foreground" : "text-muted-foreground"}`} />
                                <span className={`relative ${ativo ? "text-primary-foreground" : "text-muted-foreground"}`}>
                                  {ROTULO_MODULO[item]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Explica em uma frase o que é o tipo de dado escolhido
                          — troca junto com a aba, com fade curto pra leitura
                          acompanhar a mudança sem susto. */}
                      {modulo && (
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.p
                            key={modulo}
                            initial={reduzir ? false : { opacity: 0, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -3 }}
                            transition={transicao(reduzir, { duration: 0.16 })}
                            className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {EXPLICACAO_MODULO[modulo]}
                          </motion.p>
                        </AnimatePresence>
                      )}

                      <div className="mt-2.5 space-y-2">
                        {contasVisiveis.map((conta, indice) => (
                          <LinhaConta
                            key={conta.id}
                            conta={conta}
                            modulo={modulo}
                            indice={indice}
                            ocupada={(conta.execucao?.emAndamento ?? false) || contaDisparando === conta.id}
                            onVerificar={() => modulo && void verificarConta(conta.id, modulo)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {!primeiraCarga && painel && painel.contas.length === 0 && (
                    <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center">
                      <GenericIllustration />
                      <p className="text-xs font-semibold text-foreground">Nenhum canal conectado</p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Conecte uma conta em Configurações para o sistema começar a trazer dados.
                      </p>
                    </div>
                  )}

                  {/* Tranquiliza: mexer na tela não gasta nada nem dispara
                      busca sem querer. Antes dizia "nunca inicia chamada
                      externa" — a pessoa não sabe o que é uma chamada. */}
                  <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-muted/50 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <Check size={13} strokeWidth={2.6} className="mt-0.5 shrink-0" style={{ color: "var(--success)" }} />
                    <span>
                      Pode navegar à vontade: abrir telas, filtrar ou trocar de página
                      <strong className="font-semibold text-foreground"> nunca</strong> consulta os canais.
                      Só os botões acima fazem isso.
                    </span>
                  </p>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function LinhaConta({ conta, modulo, indice, ocupada, onVerificar }: {
  conta: PainelAtualizacao["contas"][number];
  modulo: ModuloSincronizacao | null;
  indice: number;
  ocupada: boolean;
  onVerificar: () => void;
}) {
  const reduzir = useReducedMotion();
  const corMarca = isBrandSlug(conta.brandSlug) ? getBrandConfig(conta.brandSlug)?.color : undefined;
  const atualidade = conta.atualidade.find((item) => item.modulo === modulo);
  const espera = atualidade?.esperarSegundos ?? 0;
  const bloqueada = ocupada || espera > 0 || !modulo;
  const exato = quandoExato(atualidade?.ultimoSucesso);

  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transicao(reduzir, { ...springs.settleFast, delay: indice * 0.04 })}
      className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5"
    >
      <ChannelLogo canal={conta.canal} size="sm" variant="badge" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-foreground">
          {conta.canalLabel}
          {conta.usaProxy && (
            <span className="shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide text-muted-foreground ring-1 ring-border" title="Este canal sai pelo proxy de IP fixo">
              proxy
            </span>
          )}
        </p>
        <p className="truncate text-[11px]" style={{ color: corMarca }}>{conta.brandLabel}</p>
        {/* A idade do dado — a pergunta que a porcentagem sozinha nunca
            respondeu ("o estoque da Shopee é de quando?"). O relativo diz se
            está fresco; a data exata ao lado diz de quando, sem precisar
            calcular de cabeça. */}
        {atualidade?.ultimoSucesso ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Buscado <strong className="font-bold text-foreground">{idade(atualidade.ultimoSucesso)}</strong>
            {exato && <span className="text-muted-foreground/80"> · {exato}</span>}
          </p>
        ) : (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <AlertTriangle size={11} className="shrink-0" />
            Nunca buscado
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={bloqueada}
        onClick={onVerificar}
        title={espera > 0
          ? `Buscado há pouco. Para não sobrecarregar o canal, você pode buscar de novo em ${Math.ceil(espera / 60)} min.`
          : "Buscar agora o que mudou neste canal"}
        className="press-feedback inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-45"
      >
        <motion.span
          animate={ocupada && !reduzir ? { rotate: 360 } : { rotate: 0 }}
          transition={ocupada ? { duration: 0.9, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
          className="grid place-items-center"
        >
          <RefreshCw size={13} />
        </motion.span>
        {ocupada
          ? `${conta.execucao?.progresso ?? 0}%`
          : espera > 0 ? `${Math.ceil(espera / 60)} min` : "Buscar"}
      </button>
    </motion.div>
  );
}
