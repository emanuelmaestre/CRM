"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2, CircleDashed, DatabaseBackup, Download, Loader2, Sparkles,
} from "lucide-react";
import { springs, stagger, variantes, fadeUp } from "@/shared/design-system/motion-variants";
import { tint } from "@/shared/design-system/color";
import { TABELAS_BACKUP, type ChaveTabelaBackup } from "@/modules/backups/application/tabelas";
import {
  actionBaixarBackup, actionExportarTabelaBackup, actionFinalizarBackup,
  actionIniciarBackup, actionListarBackups,
} from "./actions";

type Historico = Awaited<ReturnType<typeof actionListarBackups>>;
type EstadoTabela = "pendente" | "processando" | "concluida";

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusHistorico({ status }: { status: string }) {
  const config = status === "concluido"
    ? { label: "Concluído", cor: "var(--success)" }
    : status === "falhou"
      ? { label: "Falhou", cor: "var(--destructive)" }
      : { label: "Processando", cor: "var(--info)" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ background: tint(config.cor, 10), color: config.cor }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: config.cor }} />
      {config.label}
    </span>
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
      setConcluido({ urlAssinada: finalizado.urlAssinada, tamanhoBytes: finalizado.tamanhoBytes ?? 0 });
      toast.success("Backup gerado com sucesso.");
      carregarHistorico();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o backup.");
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
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o link de download.");
    }
  }

  const emAndamento = rodando || finalizando;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.06em] text-muted-foreground">
          <DatabaseBackup size={13} />
          Exportar dados da organização
        </p>
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

      <div className="rounded-[0.9rem] border border-border bg-background/60 p-4">
        <AnimatePresence mode="wait" initial={false}>
          {!emAndamento && !concluido && (
            <motion.p
              key="parado"
              initial={reduzir ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[12px] leading-relaxed text-muted-foreground"
            >
              Gera um ZIP com JSON e CSV de {TABELAS_BACKUP.length} tabelas (clientes, produtos, pedidos, canais,
              usuários, réguas e auditoria), tudo desta organização. Fica disponível pra download por 24h — depois
              disso, gere um novo a partir daqui.
            </motion.p>
          )}

          {(emAndamento || concluido) && (
            <motion.div key="progresso" initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: concluido ? "var(--success)" : "var(--primary)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentual}%` }}
                  transition={springs.settleFast}
                />
              </div>

              <motion.ul variants={stagger} initial="hidden" animate="show" className="space-y-1.5">
                {TABELAS_BACKUP.map((tabela) => {
                  const estado = progresso[tabela.chave];
                  return (
                    <motion.li key={tabela.chave} variants={variantes(reduzir, fadeUp)} className="flex items-center gap-2.5 text-[12.5px]">
                      {estado === "concluida" ? (
                        <CheckCircle2 size={15} className="shrink-0 text-success" />
                      ) : estado === "processando" ? (
                        <Loader2 size={15} className="shrink-0 animate-spin text-primary" />
                      ) : (
                        <CircleDashed size={15} className="shrink-0 text-muted-foreground/50" />
                      )}
                      <span className={estado === "pendente" ? "text-muted-foreground" : "text-foreground"}>{tabela.label}</span>
                      {linhasPorTabela[tabela.chave] !== undefined && (
                        <span className="tabular-nums text-muted-foreground">· {linhasPorTabela[tabela.chave]} registros</span>
                      )}
                    </motion.li>
                  );
                })}
                <motion.li variants={variantes(reduzir, fadeUp)} className="flex items-center gap-2.5 text-[12.5px]">
                  {concluido ? (
                    <CheckCircle2 size={15} className="shrink-0 text-success" />
                  ) : finalizando ? (
                    <Loader2 size={15} className="shrink-0 animate-spin text-primary" />
                  ) : (
                    <CircleDashed size={15} className="shrink-0 text-muted-foreground/50" />
                  )}
                  <span className={finalizando || concluido ? "text-foreground" : "text-muted-foreground"}>Compactando e salvando o arquivo</span>
                </motion.li>
              </motion.ul>

              {concluido && (
                <motion.div
                  initial={reduzir ? false : { opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={springs.settle}
                  className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[0.75rem] border p-3.5"
                  style={{ borderColor: "color-mix(in srgb, var(--success) 30%, transparent)", background: tint("var(--success)", 6) }}
                >
                  <p className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
                    <Sparkles size={15} className="text-success" />
                    Pronto — {formatarTamanho(concluido.tamanhoBytes)}, válido por 24h.
                  </p>
                  <a
                    href={concluido.urlAssinada}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[0.65rem] bg-success px-3 text-xs font-bold text-white transition-opacity hover:opacity-90"
                  >
                    <Download size={13} />
                    Baixar ZIP
                  </a>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {historico !== null && historico.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">Histórico</p>
          <ul className="divide-y divide-border overflow-hidden rounded-[0.9rem] border border-border">
            {historico.map((item) => {
              const totalLinhas = Array.isArray(item.tabelas)
                ? (item.tabelas as Array<{ linhas: number }>).reduce((soma, t) => soma + t.linhas, 0)
                : null;
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[12.5px]">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      {dataHora.format(new Date(item.createdAt))}
                      <StatusHistorico status={item.status} />
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {item.solicitadoPorNome ?? "—"}
                      {totalLinhas !== null && ` · ${totalLinhas} registros`}
                      {item.tamanhoBytes && ` · ${formatarTamanho(item.tamanhoBytes)}`}
                      {item.status === "falhou" && item.erro && ` · ${item.erro}`}
                    </p>
                  </div>
                  {item.status === "concluido" && (
                    <button
                      type="button"
                      onClick={() => baixarAnterior(item.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[0.6rem] border border-border px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
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
