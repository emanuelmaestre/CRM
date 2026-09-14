"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Lightbulb, MonitorSmartphone, NotebookText, Scale } from "lucide-react";
import { Dialog } from "@/shared/design-system/primitives/Dialog";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { cn } from "@/shared/design-system/cn";
import channelsConfig from "@/config/channels.json";
import { CANAIS_NOTA, naoSeAplica, type AssuntoNota, type CanalNota, type NotaDoCanal } from "./tipos";

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
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={cn(
          "press-feedback inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          larguraTotal && "w-full",
        )}
      >
        <NotebookText size={14} aria-hidden="true" />
        Notas
      </button>
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
  const [indice, setIndice] = useState(0);
  const atual = assuntos[indice];
  const ultimo = indice === assuntos.length - 1;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(open) => { if (!open) { onClose(); setIndice(0); } }}
      title={titulo}
      description="Como cada número é calculado em cada canal, onde encontrá-lo no CRM e onde conferir no painel oficial."
      fullscreen
    >
      <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
        {/* Índice: lateral fixa no desktop, fileira que rola no celular. */}
        <nav aria-label="Assuntos" className="-mx-4 mb-5 overflow-x-auto px-4 scrollbar-none md:mx-0 md:mb-0 md:overflow-visible md:px-0">
          <ol className="flex gap-2 md:sticky md:top-0 md:flex-col md:gap-1">
            {assuntos.map((assunto, i) => (
              <li key={assunto.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setIndice(i)}
                  aria-current={i === indice ? "step" : undefined}
                  className={cn(
                    "flex h-10 w-full items-center gap-2.5 whitespace-nowrap rounded-full border px-3 text-left text-[13px] font-semibold transition-colors md:h-auto md:whitespace-normal md:rounded-xl md:border-transparent md:py-2",
                    i === indice ? "border-selecionado bg-selecionado/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      i < indice ? "bg-success/15 text-success" : i === indice ? "bg-selecionado text-white" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i < indice ? <Check size={12} aria-hidden="true" /> : i + 1}
                  </span>
                  {assunto.titulo}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {atual && (
          <section key={atual.id} className="min-w-0" aria-live="polite">
            <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">
              Assunto {indice + 1} de {assuntos.length}
            </p>
            <h3 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">{atual.titulo}</h3>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{atual.resumo}</p>

            {atual.legenda && (
              <dl className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2 sm:gap-x-6">
                {atual.legenda.map((item) => (
                  <div key={item.titulo}>
                    <dt className="text-[13px] font-bold" style={{ color: item.cor }}>{item.titulo}</dt>
                    <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{item.texto}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-5 flex flex-col gap-3">
              {CANAIS_NOTA.map((canal) => (
                <BlocoCanal key={canal} canal={canal} nota={atual.canais[canal]} />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIndice((i) => Math.max(0, i - 1))}
                disabled={indice === 0}
                className="press-feedback inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                <ArrowLeft size={16} aria-hidden="true" /> Anterior
              </button>
              <button
                type="button"
                onClick={() => (ultimo ? (onClose(), setIndice(0)) : setIndice((i) => i + 1))}
                className="press-feedback inline-flex h-11 items-center gap-2 rounded-full bg-selecionado px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                {ultimo ? "Concluir" : <>Próximo <ArrowRight size={16} aria-hidden="true" /></>}
              </button>
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}

function BlocoCanal({ canal, nota }: { canal: CanalNota; nota: AssuntoNota["canais"][CanalNota] }) {
  const cor = channelAccent(canal);
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card" style={{ borderTopColor: cor, borderTopWidth: 3 }}>
      <header className="flex items-center gap-2.5 px-4 pt-3.5">
        <ChannelLogo canal={canal} size="sm" />
        <h4 className="text-[15px] font-semibold text-foreground">{nomeCanal(canal)}</h4>
      </header>
      {naoSeAplica(nota) ? (
        <p className="px-4 pb-4 pt-2 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Não se aplica. </span>{nota.naoSeAplica}
        </p>
      ) : (
        <NotaAplicavel nota={nota} />
      )}
    </article>
  );
}

function NotaAplicavel({ nota }: { nota: NotaDoCanal }) {
  return (
    <div className="grid gap-3 px-4 pb-4 pt-3 lg:grid-cols-3">
      <Linha icone={MonitorSmartphone} rotulo="Onde ver no CRM">{nota.ondeVer}</Linha>
      <Linha icone={Lightbulb} rotulo="O que o número significa">
        {nota.significado}
        {(nota.inclui?.length || nota.naoInclui?.length) ? (
          <span className="mt-2 block space-y-1.5">
            {nota.inclui?.length ? <Lista titulo="Entra" itens={nota.inclui} cor="var(--success)" /> : null}
            {nota.naoInclui?.length ? <Lista titulo="Não entra" itens={nota.naoInclui} cor="var(--destructive)" /> : null}
          </span>
        ) : null}
      </Linha>
      <Linha
        icone={ExternalLink}
        rotulo="Onde conferir no painel oficial"
        selo={nota.aConfirmar ? "a confirmar" : undefined}
      >
        {nota.painelOficial}
        {nota.bateComPainel && (
          <span className="mt-2 flex gap-1.5 text-foreground">
            <Scale size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{nota.bateComPainel}</span>
          </span>
        )}
      </Linha>
    </div>
  );
}

function Linha({ icone: Icone, rotulo, selo, children }: {
  icone: typeof Lightbulb;
  rotulo: string;
  selo?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">
        <Icone size={13} aria-hidden="true" />
        {rotulo}
        {selo && (
          <span
            title="Caminho descrito pela documentação do canal, ainda não conferido com a conta logada."
            className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] normal-case tracking-normal text-warning"
          >
            {selo}
          </span>
        )}
      </p>
      <div className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

function Lista({ titulo, itens, cor }: { titulo: string; itens: string[]; cor: string }) {
  return (
    <span className="block">
      <span className="text-[11.5px] font-bold" style={{ color: cor }}>{titulo}</span>
      <span className="mt-0.5 block space-y-0.5">
        {itens.map((item) => (
          <span key={item} className="block text-[12.5px] text-muted-foreground">• {item}</span>
        ))}
      </span>
    </span>
  );
}
