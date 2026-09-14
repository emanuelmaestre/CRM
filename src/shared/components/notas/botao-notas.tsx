"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Ban, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ListTree, Lightbulb, MonitorSmartphone, NotebookText, Scale } from "lucide-react";
import { Dialog } from "@/shared/design-system/primitives/Dialog";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { cn } from "@/shared/design-system/cn";
import { springs } from "@/shared/design-system/motion-variants";
import channelsConfig from "@/config/channels.json";
import { CANAIS_NOTA, naoSeAplica, type AssuntoNota, type CanalNota, type NotaDoCanal } from "./tipos";

const CONSULTA_TOQUE = "(pointer: coarse)";
const assinarPonteiro = (avisar: () => void) => {
  const consulta = window.matchMedia(CONSULTA_TOQUE);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
};
const ponteiroDeToque = () => window.matchMedia(CONSULTA_TOQUE).matches;

function nomeCanal(canal: CanalNota) {
  return (channelsConfig.items as Record<string, { label?: string }>)[canal]?.label ?? canal;
}

/** Botão NOTAS: abre, em tela cheia, as notas do módulo em que está. */
export function BotaoNotas({ titulo, assuntos, larguraTotal }: {
  titulo: string;
  assuntos: AssuntoNota[];
  larguraTotal?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const reduzir = useReducedMotion();
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setAberto(true)}
        initial="parado"
        whileHover="foco"
        whileTap={reduzir ? undefined : { scale: 0.95 }}
        className={cn(
          "group press-feedback inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[0.75rem] border border-border bg-muted px-3.5 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:bg-card hover:text-foreground",
          larguraTotal && "w-full md:w-auto",
        )}
      >
        {/* Mesmo visual do botão Período ao lado; o caderno balança ao passar o mouse. */}
        <motion.span
          variants={reduzir ? undefined : { parado: { rotate: 0, y: 0 }, foco: { rotate: [0, -12, 8, 0], y: -1 } }}
          transition={{ duration: 0.5 }}
          className="inline-flex text-muted-foreground transition-colors group-hover:text-foreground"
        >
          <NotebookText size={15} aria-hidden="true" />
        </motion.span>
        Notas
      </motion.button>
      <NotasWizard aberto={aberto} onClose={() => setAberto(false)} titulo={titulo} assuntos={assuntos} />
    </>
  );
}

function NotasWizard({ aberto, onClose, titulo, assuntos }: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  assuntos: AssuntoNota[];
}) {
  const reduzir = useReducedMotion();
  const [[indice, direcao], setPasso] = useState<[number, number]>([0, 0]);
  const atual = assuntos[indice];
  const ultimo = indice === assuntos.length - 1;
  const irPara = (proximo: number) => setPasso([proximo, proximo > indice ? 1 : -1]);
  const [folhaAberta, setFolhaAberta] = useState(false);
  const fechar = () => { onClose(); setPasso([0, 0]); setFolhaAberta(false); };
  const deslocamento = reduzir ? 0 : 28;
  const toque = useSyncExternalStore(assinarPonteiro, ponteiroDeToque, () => false);
  const conteudoRef = useRef<HTMLDivElement>(null);

  // Ao trocar de assunto: volta o texto para o topo e, no celular, traz a
  // pílula do assunto para o meio da fileira do índice.
  useEffect(() => {
    if (!aberto) return;
    conteudoRef.current?.closest(".overflow-y-auto")?.scrollTo?.({ top: 0, behavior: reduzir ? "auto" : "smooth" });
  }, [aberto, indice, reduzir]);

  // Setas do teclado trocam de assunto, como num livro.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "ArrowRight" && indice < assuntos.length - 1) setPasso([indice + 1, 1]);
      if (evento.key === "ArrowLeft" && indice > 0) setPasso([indice - 1, -1]);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, indice, assuntos.length]);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(open) => { if (!open) fechar(); }}
      title={titulo}
      description="Para cada número: o que ele conta em cada canal, onde achar aqui no CRM e onde conferir no painel do canal."
      fullscreen
    >
      {/* Progresso: uma barra só, que anda a cada assunto. */}
      <motion.div
        initial={reduzir ? false : { opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springs.settle}
      >
      <div ref={conteudoRef} className="relative mb-4 h-1.5 overflow-hidden rounded-full bg-muted sm:mb-5" aria-hidden="true">
        <motion.div
          className="relative h-full overflow-hidden rounded-full bg-selecionado"
          initial={false}
          animate={{ width: `${((indice + 1) / assuntos.length) * 100}%` }}
          transition={reduzir ? { duration: 0 } : springs.settle}
        >
          {/* Brilho que corre dentro da barra: mostra que o caminho continua. */}
          {!reduzir && (
            <motion.span
              className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              animate={{ x: ["-2.5rem", "40rem"] }}
              transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
            />
          )}
        </motion.div>
      </div>

      {/* Celular: seletor compacto com a posição e setas; a lista agrupada
          abre numa folha de baixo para cima (mesmo padrão do calendário). */}
      <div className="mb-4 flex items-center gap-2 md:hidden">
        <motion.button
          type="button"
          onClick={() => irPara(indice - 1)}
          disabled={indice === 0}
          whileTap={reduzir ? undefined : { scale: 0.9 }}
          aria-label="Assunto anterior"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground disabled:opacity-35"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </motion.button>
        <motion.button
          type="button"
          onClick={() => setFolhaAberta(true)}
          whileTap={reduzir ? undefined : { scale: 0.97 }}
          aria-haspopup="dialog"
          aria-expanded={folhaAberta}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-muted px-3 text-left text-[13px] font-semibold text-foreground"
        >
          <ListTree size={15} className="shrink-0 text-selecionado" aria-hidden="true" />
          <span className="shrink-0 tabular-nums text-muted-foreground">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={indice}
                className="inline-block"
                initial={reduzir ? false : { y: direcao * 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduzir ? undefined : { y: -direcao * 12, opacity: 0 }}
                transition={springs.settleFast}
              >
                {indice + 1}
              </motion.span>
            </AnimatePresence>
            /{assuntos.length}
          </span>
          <span className="min-w-0 flex-1 truncate">{atual?.titulo}</span>
          <motion.span animate={{ rotate: folhaAberta ? 180 : 0 }} transition={springs.settleFast} className="inline-flex shrink-0 text-muted-foreground">
            <ChevronDown size={16} aria-hidden="true" />
          </motion.span>
        </motion.button>
        <motion.button
          type="button"
          onClick={() => irPara(indice + 1)}
          disabled={ultimo}
          whileTap={reduzir ? undefined : { scale: 0.9 }}
          aria-label="Próximo assunto"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground disabled:opacity-35"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </motion.button>
      </div>

      <FolhaAssuntos
        aberta={folhaAberta}
        onFechar={() => setFolhaAberta(false)}
        assuntos={assuntos}
        indice={indice}
        onEscolher={(i) => { irPara(i); setFolhaAberta(false); }}
        reduzir={reduzir}
      />

      <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
        <nav aria-label="Assuntos" className="hidden md:block">
          <ol className="sticky top-0 flex flex-col gap-1">
            {assuntos.map((assunto, i) => {
              const Icone = assunto.icone;
              const ativo = i === indice;
              const abreGrupo = i === 0 || assuntos[i - 1].grupo !== assunto.grupo;
              return (
                <Fragment key={assunto.id}>
                {abreGrupo && (
                  <li aria-hidden="true" className={cn("px-3 pb-1 text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-foreground/80", i > 0 && "mt-3")}>
                    {assunto.grupo}
                  </li>
                )}
                <li className="relative">
                  {ativo && (
                    // O realce desliza de um item para o outro em vez de piscar.
                    <motion.span
                      layoutId="notas-indice-ativo"
                      transition={reduzir ? { duration: 0 } : springs.settle}
                      className="absolute inset-0 rounded-xl border border-selecionado bg-selecionado/10"
                    />
                  )}
                  <motion.button
                    type="button"
                    onClick={() => irPara(i)}
                    whileTap={reduzir ? undefined : { scale: 0.94 }}
                    whileHover={reduzir || ativo ? undefined : { x: 3 }}
                    transition={springs.settleFast}
                    aria-current={ativo ? "step" : undefined}
                    className={cn(
                      "relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-colors",
                      ativo ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                        i < indice ? "bg-success/15 text-success" : ativo ? "bg-selecionado text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={i < indice ? "feito" : "icone"}
                          initial={reduzir ? false : { scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={reduzir ? undefined : { scale: 0.4, opacity: 0 }}
                          transition={springs.momentum}
                          className="inline-flex"
                        >
                          {i < indice ? <Check size={12} aria-hidden="true" /> : <Icone size={12} aria-hidden="true" />}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    {assunto.titulo}
                  </motion.button>
                </li>
                </Fragment>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 overflow-x-clip">
          <AnimatePresence mode="wait" initial={false} custom={direcao}>
            {atual && (
              <motion.section
                key={atual.id}
                aria-live="polite"
                initial={{ opacity: 0, x: direcao * deslocamento }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -direcao * deslocamento }}
                transition={reduzir ? { duration: 0 } : springs.settleFast}
                drag={toque && !reduzir ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.25}
                dragDirectionLock
                onDragEnd={(_, info) => {
                  if (info.offset.x < -80 && !ultimo) irPara(indice + 1);
                  if (info.offset.x > 80 && indice > 0) irPara(indice - 1);
                }}
              >
                <CabecalhoAssunto assunto={atual} indice={indice} total={assuntos.length} reduzir={reduzir} />

                {atual.legenda && (
                  <motion.dl
                    className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2 sm:gap-x-6"
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: reduzir ? 0 : 0.06, delayChildren: reduzir ? 0 : 0.1 } } }}
                  >
                    {atual.legenda.map((item) => (
                      <motion.div key={item.titulo} variants={reduzir ? undefined : { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                        <dt className="text-[13px] font-bold" style={{ color: item.cor }}>{item.titulo}</dt>
                        <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{item.texto}</dd>
                      </motion.div>
                    ))}
                  </motion.dl>
                )}

                <motion.div
                  className="mt-5 flex flex-col gap-3"
                  initial="hidden"
                  animate="show"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: reduzir ? 0 : 0.08, delayChildren: reduzir ? 0 : 0.05 } } }}
                >
                  {CANAIS_NOTA.map((canal) => (
                    <BlocoCanal key={canal} canal={canal} nota={atual.canais[canal]} reduzir={reduzir} toque={toque} />
                  ))}
                </motion.div>
              </motion.section>
            )}
          </AnimatePresence>

          <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-4 sm:backdrop-blur-none">
            <motion.button
              type="button"
              onClick={() => irPara(Math.max(0, indice - 1))}
              disabled={indice === 0}
              whileTap={reduzir ? undefined : { scale: 0.96 }}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <ArrowLeft size={16} aria-hidden="true" /> <span className="hidden min-[380px]:inline">Anterior</span>
            </motion.button>
            <motion.button
              type="button"
              onClick={() => (ultimo ? fechar() : irPara(indice + 1))}
              initial="parado"
              whileHover="foco"
              whileTap={reduzir ? undefined : { scale: 0.96 }}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-selecionado px-5 text-sm font-semibold text-white shadow-[0_6px_18px_-8px_var(--selecionado)] transition-opacity hover:opacity-95"
            >
              {ultimo ? <>Concluir <Check size={16} aria-hidden="true" /></> : (
                <>
                  Próximo
                  <motion.span variants={reduzir ? undefined : { parado: { x: 0 }, foco: { x: 3 } }} transition={springs.settleFast} className="inline-flex">
                    <ArrowRight size={16} aria-hidden="true" />
                  </motion.span>
                </>
              )}
            </motion.button>
          </div>
          {toque && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground sm:hidden">
              <motion.span
                className="inline-flex"
                animate={reduzir ? undefined : { x: [0, -6, 0, 6, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                aria-hidden="true"
              >
                <ArrowLeft size={12} /><ArrowRight size={12} />
              </motion.span>
              Arraste para o lado para trocar de assunto
            </p>
          )}
        </div>
      </div>
      </motion.div>
    </Dialog>
  );
}

/** Folha do celular com todos os assuntos agrupados. Sobe de baixo, fecha
 *  ao tocar fora, no X ou arrastando para baixo. */
function FolhaAssuntos({ aberta, onFechar, assuntos, indice, onEscolher, reduzir }: {
  aberta: boolean;
  onFechar: () => void;
  assuntos: AssuntoNota[];
  indice: number;
  onEscolher: (i: number) => void;
  reduzir: boolean | null;
}) {
  return (
    <AnimatePresence>
      {aberta && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Escolher assunto">
          <motion.button
            type="button"
            aria-label="Fechar lista de assuntos"
            className="absolute inset-0 bg-black/35"
            onClick={onFechar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduzir ? 0 : 0.2 }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-[1.5rem] border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_rgba(14,15,19,.2)]"
            initial={reduzir ? { opacity: 0 } : { y: "100%" }}
            animate={reduzir ? { opacity: 1 } : { y: 0 }}
            exit={reduzir ? { opacity: 0 } : { y: "100%" }}
            transition={reduzir ? { duration: 0 } : springs.drawer}
            drag={reduzir ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 500) onFechar(); }}
          >
            <div className="flex shrink-0 flex-col items-center px-4 pb-2 pt-2.5">
              <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-border" />
              <div className="mt-3 flex w-full items-center justify-between">
                <p className="text-[15px] font-semibold text-foreground">Assuntos</p>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{indice + 1} de {assuntos.length}</span>
              </div>
            </div>
            <motion.ol
              className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: reduzir ? 0 : 0.03, delayChildren: reduzir ? 0 : 0.12 } } }}
            >
              {assuntos.map((assunto, i) => {
                const Icone = assunto.icone;
                const ativo = i === indice;
                const abreGrupo = i === 0 || assuntos[i - 1].grupo !== assunto.grupo;
                return (
                  <Fragment key={assunto.id}>
                    {abreGrupo && (
                      <li aria-hidden="true" className={cn("px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-foreground/80", i > 0 && "mt-3")}>
                        {assunto.grupo}
                      </li>
                    )}
                    <motion.li variants={reduzir ? undefined : { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                      <motion.button
                        type="button"
                        onClick={() => onEscolher(i)}
                        whileTap={reduzir ? undefined : { scale: 0.97 }}
                        aria-current={ativo ? "step" : undefined}
                        className={cn(
                          "flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[14px] font-semibold",
                          ativo ? "bg-selecionado/10 text-foreground ring-1 ring-selecionado" : "text-foreground/85",
                        )}
                      >
                        <span className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          i < indice ? "bg-success/15 text-success" : ativo ? "bg-selecionado text-white" : "bg-muted text-muted-foreground",
                        )}>
                          {i < indice ? <Check size={14} aria-hidden="true" /> : <Icone size={14} aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block">{assunto.titulo}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      </motion.button>
                    </motion.li>
                  </Fragment>
                );
              })}
            </motion.ol>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Ilustração do assunto: o ícone num disco com dois anéis que se abrem
 *  quando o assunto entra. Um desenho só, repetido em todos, para o olho
 *  achar o título sem competir com o conteúdo. */
function CabecalhoAssunto({ assunto, indice, total, reduzir }: {
  assunto: AssuntoNota;
  indice: number;
  total: number;
  reduzir: boolean | null;
}) {
  const Icone = assunto.icone;
  return (
    <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap sm:gap-4">
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center sm:h-16 sm:w-16" aria-hidden="true">
        {[0, 1].map((anel) => (
          <motion.span
            key={anel}
            className="absolute inset-0 rounded-full border border-selecionado/25"
            initial={reduzir ? false : { scale: 0.6, opacity: 0 }}
            animate={reduzir
              ? { scale: 1 + anel * 0.28, opacity: anel === 0 ? 1 : 0.5 }
              : { scale: [1 + anel * 0.28, 1.08 + anel * 0.34, 1 + anel * 0.28], opacity: anel === 0 ? [1, 0.6, 1] : [0.5, 0.2, 0.5] }}
            transition={reduzir
              ? { duration: 0 }
              : { duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 + anel * 0.4 }}
          />
        ))}
        <motion.span
          className="relative flex h-9 w-9 items-center justify-center rounded-full bg-selecionado/12 text-selecionado sm:h-12 sm:w-12"
          initial={reduzir ? false : { scale: 0.5, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={springs.momentum}
        >
          <motion.span
            className="inline-flex"
            animate={reduzir ? undefined : { y: [0, -2.5, 0], rotate: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
          >
            <Icone className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" />
          </motion.span>
        </motion.span>
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">
          Assunto {indice + 1} de {total}
        </p>
        <h3 className="mt-0.5 text-lg font-semibold text-foreground sm:text-2xl">{assunto.titulo}</h3>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">{assunto.resumo}</p>
      </div>
      <IlustracaoConferencia reduzir={reduzir} />
    </div>
  );
}

function BlocoCanal({ canal, nota, reduzir, toque }: { canal: CanalNota; nota: AssuntoNota["canais"][CanalNota]; reduzir: boolean | null; toque: boolean }) {
  const cor = channelAccent(canal);
  return (
    <motion.article
      variants={{
        hidden: reduzir ? { opacity: 1 } : { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: springs.settle },
      }}
      whileHover={reduzir || toque ? undefined : { y: -3, boxShadow: "0 14px 30px -16px rgba(14,15,19,.35)" }}
      whileTap={reduzir || !toque ? undefined : { scale: 0.99 }}
      transition={springs.settleFast}
      className="relative overflow-hidden rounded-2xl border border-border bg-card"
    >
      <motion.span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px] origin-left"
        style={{ background: cor }}
        initial={reduzir ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: reduzir ? 0 : 0.1 }}
      />
      <header className="flex items-center gap-2.5 px-3 pt-3.5 sm:px-4">
        <motion.span
          className="inline-flex"
          initial={reduzir ? false : { scale: 0, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...springs.momentum, delay: reduzir ? 0 : 0.15 }}
        >
          <ChannelLogo canal={canal} size="sm" />
        </motion.span>
        <h4 className="text-[15px] font-semibold text-foreground">{nomeCanal(canal)}</h4>
      </header>
      {naoSeAplica(nota) ? (
        <div className="flex items-center gap-3 px-4 pb-4 pt-2">
          <motion.span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground"
            initial={reduzir ? false : { rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={springs.momentum}
            aria-hidden="true"
          >
            <Ban size={16} />
          </motion.span>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Não se aplica. </span>{nota.naoSeAplica}
          </p>
        </div>
      ) : (
        <NotaAplicavel nota={nota} reduzir={reduzir} />
      )}
    </motion.article>
  );
}

const entradaColuna = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: springs.settle },
};

function NotaAplicavel({ nota, reduzir }: { nota: NotaDoCanal; reduzir: boolean | null }) {
  return (
    <motion.div
      className="grid gap-2.5 px-3 pb-3 pt-3 sm:gap-3 sm:px-4 sm:pb-4 lg:grid-cols-3"
      variants={{ hidden: {}, show: { transition: { staggerChildren: reduzir ? 0 : 0.07, delayChildren: reduzir ? 0 : 0.12 } } }}
    >
      <Linha icone={MonitorSmartphone} rotulo="Onde ver no CRM" reduzir={reduzir}>{nota.ondeVer}</Linha>
      <Linha icone={Lightbulb} rotulo="O que o número significa" reduzir={reduzir}>
        {nota.significado}
        {(nota.inclui?.length || nota.naoInclui?.length) ? (
          <span className="mt-2 block space-y-1.5">
            {nota.inclui?.length ? <Lista titulo="Entra" itens={nota.inclui} cor="var(--success)" reduzir={reduzir} /> : null}
            {nota.naoInclui?.length ? <Lista titulo="Não entra" itens={nota.naoInclui} cor="var(--destructive)" reduzir={reduzir} /> : null}
          </span>
        ) : null}
      </Linha>
      <Linha
        icone={ExternalLink}
        rotulo="Onde conferir no painel oficial"
        selo={nota.aConfirmar ? "a confirmar" : undefined}
        reduzir={reduzir}
      >
        {nota.painelOficial}
        {nota.bateComPainel && (
          <span className="mt-2 flex gap-1.5 rounded-lg bg-card/70 p-2 text-foreground">
            <Scale size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{nota.bateComPainel}</span>
          </span>
        )}
      </Linha>
    </motion.div>
  );
}

function Linha({ icone: Icone, rotulo, selo, reduzir, children }: {
  icone: typeof Lightbulb;
  rotulo: string;
  selo?: string;
  reduzir: boolean | null;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={reduzir ? undefined : entradaColuna} className="group/linha min-w-0 rounded-xl bg-muted/40 p-3 transition-colors hover:bg-muted/70">
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">
        <span className="inline-flex transition-transform duration-200 group-hover/linha:scale-125 group-hover/linha:text-foreground">
          <Icone size={13} aria-hidden="true" />
        </span>
        {rotulo}
        {selo && (
          <motion.span
            title="Caminho descrito pela documentação do canal, ainda não conferido com a conta logada."
            className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] normal-case tracking-normal text-warning"
            initial={reduzir ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ ...springs.momentum, delay: reduzir ? 0 : 0.35 }}
          >
            {selo}
          </motion.span>
        )}
      </p>
      <div className="mt-1.5 break-words text-[13px] leading-relaxed text-foreground/90">{children}</div>
    </motion.div>
  );
}

function Lista({ titulo, itens, cor, reduzir }: { titulo: string; itens: string[]; cor: string; reduzir: boolean | null }) {
  return (
    <span className="block">
      <span className="text-[11.5px] font-bold" style={{ color: cor }}>{titulo}</span>
      <motion.span
        className="mt-0.5 block space-y-0.5"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: reduzir ? 0 : 0.04, delayChildren: reduzir ? 0 : 0.3 } } }}
      >
        {itens.map((item) => (
          <motion.span
            key={item}
            variants={reduzir ? undefined : { hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
            className="flex gap-1.5 text-[12.5px] text-muted-foreground"
          >
            <span aria-hidden="true" className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full" style={{ background: cor }} />
            {item}
          </motion.span>
        ))}
      </motion.span>
    </span>
  );
}

/** Ilustração da conferência: a tela do CRM e o painel do canal ligados por
 *  um traço de ida e volta que se desenha, com o selo de "confere" no meio.
 *  É o vai e volta que o operador faz, desenhado no cabeçalho de cada assunto. */
function IlustracaoConferencia({ reduzir }: { reduzir: boolean | null }) {
  const desenho = (atraso: number) => (reduzir
    ? { initial: false as const }
    : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 0.7, delay: atraso, ease: "easeOut" as const } });
  return (
    <svg viewBox="0 0 180 64" className="order-last mx-auto h-12 w-full max-w-[13rem] shrink-0 text-selecionado sm:order-none sm:ml-auto sm:mr-0 sm:h-14 sm:w-40 lg:h-16 lg:w-44" aria-hidden="true" fill="none">
      <motion.rect x="4" y="10" width="46" height="36" rx="6" stroke="currentColor" strokeWidth="2" {...desenho(0)} />
      <motion.path d="M12 22h22M12 30h30M12 38h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".6" {...desenho(0.2)} />
      <motion.path d="M22 52h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...desenho(0.25)} />
      {/* Ida e volta: os tracejados correm sem parar, CRM → canal por cima e canal → CRM por baixo. */}
      <motion.path d="M56 26 C78 8, 102 8, 124 26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity=".55"
        initial={reduzir ? false : { opacity: 0 }}
        animate={reduzir ? undefined : { opacity: 0.55, strokeDashoffset: [0, -16] }}
        transition={{ opacity: { duration: 0.4, delay: 0.4 }, strokeDashoffset: { duration: 1, repeat: Infinity, ease: "linear" } }} />
      <motion.path d="M124 38 C102 56, 78 56, 56 38" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity=".55"
        initial={reduzir ? false : { opacity: 0 }}
        animate={reduzir ? undefined : { opacity: 0.55, strokeDashoffset: [0, -16] }}
        transition={{ opacity: { duration: 0.4, delay: 0.55 }, strokeDashoffset: { duration: 1, repeat: Infinity, ease: "linear" } }} />
      <motion.g
        initial={reduzir ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...springs.momentum, delay: reduzir ? 0 : 0.9 }}
        style={{ transformOrigin: "90px 32px" }}
      >
        <motion.circle cx="90" cy="32" r="10" fill="currentColor" opacity=".14"
          animate={reduzir ? undefined : { r: [10, 13, 10], opacity: [0.14, 0.05, 0.14] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 1.2 }} />
        <path d="M85 32l3.5 3.5L95 29" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      <motion.rect x="130" y="10" width="46" height="36" rx="6" stroke="currentColor" strokeWidth="2" {...desenho(0.1)} />
      {[["138", 30], ["146", 22], ["154", 26], ["162", 18]].map(([x, topo], i) => (
        <motion.path key={x} d={`M${x} 38V${topo}`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".6"
          initial={reduzir ? false : { pathLength: 0 }}
          animate={reduzir ? undefined : { pathLength: [1, 0.55, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 + i * 0.18 }} />
      ))}
    </svg>
  );
}
