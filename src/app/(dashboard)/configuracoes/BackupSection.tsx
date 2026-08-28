"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2, ChevronDown, CircleDashed, DatabaseBackup, Download, Loader2,
} from "lucide-react";
import { springs, stagger, variantes, fadeUp } from "@/shared/design-system/motion-variants";
import { tint } from "@/shared/design-system/color";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { TABELAS_BACKUP, type ChaveTabelaBackup } from "@/modules/backups/application/tabelas";
import {
  actionBaixarBackup, actionExportarTabelaBackup, actionFinalizarBackup,
  actionIniciarBackup, actionListarBackups,
} from "./actions";

type Historico = Awaited<ReturnType<typeof actionListarBackups>>;
type EstadoTabela = "pendente" | "processando" | "concluida";

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return "Sem dado";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Uma linha do checklist. O ícone "carimba" ao virar concluído — scale
 *  0.6→1 numa spring curta, só nesse instante — em vez de trocar
 *  instantaneamente de traço pontilhado pra check, o que passava batido. */
function LinhaTabela({ label, estado, linhas, reduzir }: {
  label: string;
  estado: EstadoTabela;
  linhas?: number;
  reduzir: boolean | null;
}) {
  return (
    <motion.li variants={variantes(reduzir, fadeUp)} className="flex items-center gap-2.5 text-[12.5px]">
      <AnimatePresence mode="wait" initial={false}>
        {estado === "concluida" ? (
          <motion.span
            key="concluida"
            initial={reduzir ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springs.settleFast}
            className="shrink-0"
          >
            <CheckCircle2 size={15} className="text-success" />
          </motion.span>
        ) : estado === "processando" ? (
          <Loader2 key="processando" size={15} className="shrink-0 animate-spin text-primary" />
        ) : (
          <CircleDashed key="pendente" size={15} className="shrink-0 text-muted-foreground/50" />
        )}
      </AnimatePresence>
      <span className={estado === "pendente" ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      {linhas !== undefined && <span className="tabular-nums text-muted-foreground">· {linhas} registros</span>}
    </motion.li>
  );
}

/** Exportação sob demanda dos dados da organização. Progresso real, não
 *  simulado: cada tabela é uma chamada de servidor de verdade que só volta
 *  quando aquela tabela terminou de ser lida — a barra anda no ritmo do
 *  banco, não de um timer decorativo. */
export function BackupSection() {
  const reduzir = useReducedMotion();
  const [historico, setHistorico] = useState<Historico | null>(null);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<Record<ChaveTabelaBackup, EstadoTabela>>(() =>
    Object.fromEntries(TABELAS_BACKUP.map((t) => [t.chave, "pendente"])) as Record<ChaveTabelaBackup, EstadoTabela>,
  );
  const [linhasPorTabela, setLinhasPorTabela] = useState<Partial<Record<ChaveTabelaBackup, number>>>({});
  const [finalizando, setFinalizando] = useState(false);
  const [concluido, setConcluido] = useState<{ urlAssinada: string; tamanhoBytes: number } | null>(null);
  const [verDetalhes, setVerDetalhes] = useState(false);

  const carregarHistorico = useCallback(() => {
    actionListarBackups().then(setHistorico).catch(() => setHistorico([]));
  }, []);

  useEffect(carregarHistorico, [carregarHistorico]);

  const concluidas = Object.values(progresso).filter((v) => v === "concluida").length;
  const percentual = rodando || concluido
    ? Math.round(((concluidas + (finalizando || concluido ? 1 : 0)) / (TABELAS_BACKUP.length + 1)) * 100)
    : 0;

  async function exportarAgora() {
    setRodando(true);
    setConcluido(null);
    setFinalizando(false);
    setVerDetalhes(false);
    setProgresso(Object.fromEntries(TABELAS_BACKUP.map((t) => [t.chave, "pendente"])) as Record<ChaveTabelaBackup, EstadoTabela>);
    setLinhasPorTabela({});

    try {
      const { backupId } = await actionIniciarBackup();

      for (const tabela of TABELAS_BACKUP) {
        setProgresso((atual) => ({ ...atual, [tabela.chave]: "processando" }));
        const resultado = await actionExportarTabelaBackup({ backupId, chave: tabela.chave });
        setLinhasPorTabela((atual) => ({ ...atual, [tabela.chave]: resultado.linhas }));
        setProgresso((atual) => ({ ...atual, [tabela.chave]: "concluida" }));
      }

      setFinalizando(true);
      const finalizado = await actionFinalizarBackup(backupId);
      setFinalizando(false);
      if (!finalizado.ok) {
        toast.error(finalizado.erro);
        carregarHistorico();
        return;
      }
      setConcluido({ urlAssinada: finalizado.backup.urlAssinada, tamanhoBytes: finalizado.backup.tamanhoBytes ?? 0 });
      toast.success("Cópia de segurança gerada com sucesso.");
      carregarHistorico();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a cópia de segurança.");
      setFinalizando(false);
    } finally {
      setRodando(false);
    }
  }

  async function baixarAnterior(id: string) {
    try {
      const { urlAssinada } = await actionBaixarBackup(id);
      window.open(urlAssinada, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o link para baixar o arquivo.");
    }
  }

  const emAndamento = rodando || finalizando;
  const ultimaConcluida = historico?.find((item) => item.status === "concluido") ?? null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {/* No lugar do rótulo "EXPORTAR", que só repetia o título do card e o
            texto do próprio botão: a única coisa que alguém quer saber antes
            de clicar — quando foi a última cópia que deu certo. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 text-[12.5px] text-muted-foreground">
            {ultimaConcluida ? (
              <>
                Última cópia:{" "}
                <span className="font-semibold text-foreground">
                  {dataHora.format(new Date(ultimaConcluida.createdAt))}
                </span>
                {ultimaConcluida.tamanhoBytes ? ` · ${formatarTamanho(ultimaConcluida.tamanhoBytes)}` : ""}
              </>
            ) : historico === null ? (
              "Carregando…"
            ) : (
              "Nenhuma cópia gerada ainda."
            )}
          </p>
          <AnimatedInfoPopover
            trigger={(
              <AnimatedInfoTrigger
                aria-label="Como funciona a exportação"
                iconSize={13}
                className="press-feedback inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
            align="start"
            sideOffset={8}
            collisionPadding={12}
            className="z-[100] w-[min(20rem,calc(100vw-1.5rem))] rounded-[0.9rem] border border-border bg-card p-4 shadow-[0_16px_40px_rgba(14,15,19,.24)] lg:w-[min(38rem,calc(100vw-1.5rem))]"
          >
                <p className="text-[13px] font-semibold text-foreground">Exportação sob demanda dos dados da organização, em JSON e CSV</p>
                <div className="mt-2 flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-5">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Gera um arquivo ZIP com dados em JSON e CSV de {TABELAS_BACKUP.length} tabelas: clientes, produtos,
                    pedidos, canais, usuários, réguas e auditoria. Todas pertencem a esta organização.
                  </p>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    O arquivo fica disponível para ser baixado por 24 horas. Depois desse prazo, basta gerar uma nova exportação.
                  </p>
                </div>
          </AnimatedInfoPopover>
        </div>
        <motion.button
          type="button"
          onClick={exportarAgora}
          disabled={emAndamento}
          whileHover={reduzir || emAndamento ? undefined : { scale: 1.02 }}
          whileTap={reduzir || emAndamento ? undefined : { scale: 0.98 }}
          className="inline-flex h-10 items-center gap-2 rounded-[0.7rem] bg-foreground px-4 text-sm font-semibold text-background transition-opacity disabled:opacity-60"
        >
          {emAndamento ? <Loader2 size={15} className="animate-spin" /> : <DatabaseBackup size={15} />}
          {emAndamento ? "Exportando…" : "Exportar agora"}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {(emAndamento || concluido) && (
          <motion.div
            key="progresso"
            initial={reduzir ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-[0.9rem] border border-border bg-background/60 p-4"
          >
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full"
                style={{ background: concluido ? "var(--success)" : "var(--primary)" }}
                initial={{ width: 0 }}
                animate={{ width: `${percentual}%` }}
                transition={springs.settle}
              />
            </div>

            {/* Enquanto roda, a lista fica aberta — é o que mostra progresso
                real acontecendo. Uma vez concluído, 9 linhas idênticas com ✓
                só repetem o que a barra cheia já disse; vira um resumo de
                uma linha, com o detalhe disponível sob clique pra quem quiser
                conferir tabela por tabela. */}
            {!concluido ? (
              <motion.ul variants={stagger} initial="hidden" animate="show" className="mt-3 space-y-1.5">
                {TABELAS_BACKUP.map((tabela) => (
                  <LinhaTabela key={tabela.chave} label={tabela.label} estado={progresso[tabela.chave]} linhas={linhasPorTabela[tabela.chave]} reduzir={reduzir} />
                ))}
                <LinhaTabela label="Compactando e salvando o arquivo" estado={finalizando ? "processando" : "pendente"} reduzir={reduzir} />
              </motion.ul>
            ) : (
              <button
                type="button"
                onClick={() => setVerDetalhes((v) => !v)}
                className="mt-3 flex w-full items-center justify-between gap-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-success" />
                  {TABELAS_BACKUP.length} de {TABELAS_BACKUP.length} tabelas exportadas
                </span>
                <motion.span animate={{ rotate: verDetalhes ? 180 : 0 }} transition={springs.settleFast}>
                  <ChevronDown size={14} />
                </motion.span>
              </button>
            )}

            <AnimatePresence initial={false}>
              {concluido && verDetalhes && (
                <motion.div
                  initial={reduzir ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={springs.settleFast}
                  className="overflow-hidden"
                >
                  <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
                    {TABELAS_BACKUP.map((tabela) => (
                      <LinhaTabela key={tabela.chave} label={tabela.label} estado="concluida" linhas={linhasPorTabela[tabela.chave]} reduzir={reduzir} />
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fora do card do checklist, de propósito — é um resultado, não mais
          um item da lista de progresso. */}
      <AnimatePresence>
        {concluido && (
          <motion.div
            initial={reduzir ? false : { opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={springs.settle}
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[0.9rem] border p-3.5"
            style={{ borderColor: "color-mix(in srgb, var(--success) 30%, transparent)", background: tint("var(--success)", 6) }}
          >
            <p className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
              <CheckCircle2 size={15} className="text-success" />
              Pronto: {formatarTamanho(concluido.tamanhoBytes)}, válido por 24h.
            </p>
            <a
              href={concluido.urlAssinada}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-[0.65rem] border px-3 text-xs font-bold transition-colors hover:brightness-95"
              style={{ borderColor: "color-mix(in srgb, var(--success) 40%, transparent)", color: "var(--success)" }}
            >
              <Download size={13} />
              Baixar ZIP
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {historico !== null && historico.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">Histórico</p>
          {/* Sem caixa com borda em volta: o card da seção já é a moldura, e
              a borda dupla engordava a lista sem separar nada. A falha perde
              o chip vermelho — uma tentativa que não deu certo semanas atrás
              não precisa gritar toda vez que a página abre; fica em cinza,
              legível e fora do caminho. */}
          <ul className="divide-y divide-border/60">
            {historico.map((item) => {
              const totalLinhas = Array.isArray(item.tabelas)
                ? (item.tabelas as Array<{ linhas: number }>).reduce((soma, t) => soma + t.linhas, 0)
                : null;
              const falhou = item.status === "falhou";
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12.5px]">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: falhou
                          ? "var(--border)"
                          : item.status === "concluido" ? "var(--success)" : "var(--info)",
                      }}
                    />
                    <div className="min-w-0">
                      <p className={`font-semibold ${falhou ? "text-muted-foreground" : "text-foreground"}`}>
                        {dataHora.format(new Date(item.createdAt))}
                        {falhou && <span className="ml-2 font-medium">não concluída</span>}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {item.solicitadoPorNome ?? "Não identificado"}
                        {totalLinhas !== null && ` · ${totalLinhas} registros`}
                        {item.tamanhoBytes && ` · ${formatarTamanho(item.tamanhoBytes)}`}
                        {falhou && item.erro && ` · ${item.erro}`}
                      </p>
                    </div>
                  </div>
                  {item.status === "concluido" && (
                    <button
                      type="button"
                      onClick={() => baixarAnterior(item.id)}
                      className="press-feedback inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                      <Download size={12} />
                      Baixar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

    </div>
  );
}
