"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ChevronRight, Copy, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import settingsConfig from "@/config/settings.json";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import type { CanalConfiguracao } from "@/modules/canais/application/configuracao-canais.service";
import { actionAtualizarContaCanal, actionRemoverContaCanal } from "./actions";
import { MLChannelActions } from "./MLChannelActions";
import type { MercadoLivreStatus } from "./useMercadoLivreStatus";

const cascataLinhas = { hidden: {}, show: { transition: { staggerChildren: 0.035 } } };
const linhaVariant = {
  hidden: { opacity: 0, x: -6 },
  show: { opacity: 1, x: 0, transition: { duration: 0.2, ease: [0, 0, 0.2, 1] as const } },
};

const VERDE = "var(--success)";
const AMBAR = "var(--warning)";
const VERMELHO = "var(--destructive)";

function formatarData(value: string | null) {
  if (!value) return "nunca verificado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function precisaAtencao(item: CanalConfiguracao) {
  return !item.pronto;
}

/** Uma frase por linha fechada: o motivo pelo qual você abriria essa linha. */
function resumoLinha(item: CanalConfiguracao) {
  if (item.ultimoErro) return item.ultimoErro;
  if (item.envAusentes.length > 0) {
    const n = item.envAusentes.length;
    return `${n} credencia${n === 1 ? "l" : "is"} pendente${n === 1 ? "" : "s"}`;
  }
  if (!item.channelAccountId) return "conta não cadastrada";
  if (item.skusMapeados === 0) return "sem SKUs mapeados";
  return `${item.skusMapeados} SKU${item.skusMapeados === 1 ? "" : "s"} · ${formatarData(item.ultimaVerificacao)}`;
}

function corDoStatus(item: CanalConfiguracao) {
  if (item.pronto || item.status === "conectado") return VERDE;
  if (item.status === "degradado") return AMBAR;
  if (item.status === "desconectado") return VERMELHO;
  return "var(--muted-foreground)";
}

function rotuloDoStatus(item: CanalConfiguracao) {
  if (item.pronto) return "Pronto";
  if (item.status === "pendente") return "Pendente";
  return item.status.charAt(0).toUpperCase() + item.status.slice(1);
}

/**
 * Anel de progresso da marca: quantos canais já estão prontos. O arco cresce a
 * partir do zero quando o grupo entra, então o placar é lido antes do texto.
 */
function AnelProgresso({ prontos, total }: { prontos: number; total: number }) {
  const raio = 8;
  const volta = 2 * Math.PI * raio;
  const fracao = total === 0 ? 0 : prontos / total;
  const completo = prontos === total;

  return (
    <span className="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="-rotate-90">
        <circle cx="11" cy="11" r={raio} fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <motion.circle
          cx="11"
          cy="11"
          r={raio}
          fill="none"
          stroke={completo ? VERDE : AMBAR}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={volta}
          initial={{ strokeDashoffset: volta }}
          animate={{ strokeDashoffset: volta * (1 - fracao) }}
          transition={{ duration: 0.7, ease: [0, 0, 0.2, 1] }}
        />
      </svg>
      <AnimatePresence>
        {completo && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 400, damping: 18 }}
            className="absolute flex text-success"
          >
            <Check size={11} strokeWidth={3.5} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Estado "nada pendente": aparece quando o filtro de atenção não tem o que mostrar. */
function TudoProntoIllustration() {
  return (
    <div className="flex flex-col items-center gap-2 py-8">
      <svg width="72" height="52" viewBox="0 0 72 52" fill="none" aria-hidden="true">
        <rect x="6" y="10" width="60" height="34" rx="9" fill="var(--muted)" />
        <motion.path
          d="M24 27l8 8 16-16"
          stroke={VERDE}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: [0, 0, 0.2, 1] }}
        />
        <motion.circle
          cx="36" cy="27" r="21"
          fill="none" stroke={VERDE} strokeWidth="1.5"
          initial={{ scale: 0.7, opacity: 0.5 }}
          animate={{ scale: 1.15, opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          style={{ transformOrigin: "36px 27px" }}
        />
      </svg>
      <p className="text-xs font-medium text-muted-foreground">Nenhum canal pendente.</p>
    </div>
  );
}

function StatusPill({ item }: { item: CanalConfiguracao }) {
  const cor = corDoStatus(item);
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}
    >
      {rotuloDoStatus(item)}
    </span>
  );
}

function ContaCanalEditForm({ item, onCancel, onSaved }: {
  item: CanalConfiguracao; onCancel: () => void; onSaved: () => void;
}) {
  const [nome, setNome] = useState(item.contaNome ?? "");
  const [externalAccountId, setExternalAccountId] = useState(item.externalAccountId ?? "");
  const [pending, startTransition] = useTransition();

  function salvar() {
    startTransition(async () => {
      try {
        await actionAtualizarContaCanal({
          channelAccountId: item.channelAccountId,
          nome,
          externalAccountId: externalAccountId || undefined,
        });
        toast.success("Conta de canal atualizada.");
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a conta.");
      }
    });
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-card p-3">
      <input
        value={nome}
        onChange={(event) => setNome(event.target.value)}
        placeholder="Nome interno da conta"
        className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
      />
      <input
        value={externalAccountId}
        onChange={(event) => setExternalAccountId(event.target.value)}
        placeholder={settingsConfig.channelForms.externalId.placeholder}
        className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-muted-foreground disabled:opacity-50">
          <X size={12} /> Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={pending || nome.trim().length < 2 || !externalAccountId.trim()}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--gradient-signature)" }}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

/** Detalhe técnico da linha: só existe depois que você pede para ver. */
function DetalheCanal({ item, onChanged, mlStatus }: {
  item: CanalConfiguracao; onChanged: () => void; mlStatus: MercadoLivreStatus;
}) {
  const [editando, setEditando] = useState(false);
  const [removendo, startRemoverTransition] = useTransition();

  function remover() {
    const channelAccountId = item.channelAccountId;
    if (!channelAccountId) return;
    if (!window.confirm(`Remover a conta "${item.contaNome}" de ${item.canalLabel}? Essa ação não pode ser desfeita.`)) return;
    startRemoverTransition(async () => {
      try {
        await actionRemoverContaCanal({ channelAccountId });
        toast.success("Conta de canal removida.");
        onChanged();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível remover a conta.");
      }
    });
  }

  async function copiarVariaveis() {
    await navigator.clipboard.writeText(item.envAusentes.join("\n"));
    toast.success("Nomes das variáveis copiados.");
  }

  return (
    <div className="px-4 pb-4 pl-12">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        <span>{item.contaNome ?? "Conta não cadastrada"}</span>
        <span>{item.skusMapeados} SKU{item.skusMapeados === 1 ? "" : "s"}</span>
        <span>Verificado {formatarData(item.ultimaVerificacao)}</span>
        <span>
          {settingsConfig.channelForms.externalId.label}: {item.externalAccountId ?? settingsConfig.channelForms.externalId.missing}
          {item.externalAccountIdSource && (
            <span className="ml-1 opacity-70">({settingsConfig.channelForms.externalId[item.externalAccountIdSource]})</span>
          )}
        </span>
      </div>

      {item.externalAccountIdMismatch && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2.5 py-2 text-[11px] font-medium text-warning">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          {settingsConfig.channelForms.externalId.mismatch}
        </p>
      )}

      {item.ultimoErro && <p className="mt-2 text-[11px] text-destructive">{item.ultimoErro}</p>}

      {item.envAusentes.length > 0 && (
        <div className="mt-2 rounded-lg bg-muted/60 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-warning">Configure no ambiente</span>
            <button
              type="button"
              onClick={() => void copiarVariaveis()}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Copy size={11} /> Copiar
            </button>
          </div>
          <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
            {item.envAusentes.join("  ")}
          </p>
        </div>
      )}

      {item.canal === "mercadolivre" && isBrandSlug(item.brand) ? (
        <MLChannelActions slug={item.brand} brandLabel={item.brandLabel} status={mlStatus} />
      ) : null}

      {item.channelAccountId && !editando && (
        <div className="mt-3 flex gap-1">
          <button
            type="button"
            aria-label={`Editar conta de ${item.canalLabel}`}
            onClick={() => setEditando(true)}
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil size={12} /> Editar
          </button>
          <button
            type="button"
            aria-label={`Remover conta de ${item.canalLabel}`}
            onClick={remover}
            disabled={removendo}
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 size={12} /> Remover
          </button>
        </div>
      )}

      {editando && item.channelAccountId && (
        <ContaCanalEditForm
          item={item}
          onCancel={() => setEditando(false)}
          onSaved={() => { setEditando(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function LinhaCanal({ item, aberta, onToggle, onChanged, mlStatus }: {
  item: CanalConfiguracao;
  aberta: boolean;
  onToggle: () => void;
  onChanged: () => void;
  mlStatus: MercadoLivreStatus;
}) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberta}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <motion.span animate={{ rotate: aberta ? 90 : 0 }} transition={{ duration: 0.18 }} className="flex text-muted-foreground">
          <ChevronRight size={14} />
        </motion.span>
        <ChannelLogo canal={item.canalLabel} size="sm" variant="logo" />
        <span className="shrink-0 text-[13px] font-medium text-foreground">{item.canalLabel}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{resumoLinha(item)}</span>
        <StatusPill item={item} />
      </button>

      <AnimatePresence initial={false}>
        {aberta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <DetalheCanal item={item} onChanged={onChanged} mlStatus={mlStatus} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface Props {
  items: CanalConfiguracao[];
  loading: boolean;
  onChanged: () => void;
  mlStatus: MercadoLivreStatus;
}

export function CanaisPorMarca({ items, loading, onChanged, mlStatus }: Props) {
  const [soAtencao, setSoAtencao] = useState(false);
  const [marcasAbertas, setMarcasAbertas] = useState<Set<string>>(new Set());
  const [canaisAbertos, setCanaisAbertos] = useState<Set<string>>(new Set());

  const marcas = useMemo(() => {
    const visiveis = soAtencao ? items.filter(precisaAtencao) : items;
    const grupos = new Map<string, { brandId: string; brandLabel: string; brand: string; canais: CanalConfiguracao[] }>();
    for (const item of visiveis) {
      const grupo = grupos.get(item.brandId)
        ?? { brandId: item.brandId, brandLabel: item.brandLabel, brand: item.brand, canais: [] };
      grupo.canais.push(item);
      grupos.set(item.brandId, grupo);
    }
    return [...grupos.values()];
  }, [items, soAtencao]);

  const totalAtencao = items.filter(precisaAtencao).length;

  function alternarMarca(brandId: string) {
    setMarcasAbertas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(brandId)) proximo.delete(brandId);
      else proximo.add(brandId);
      return proximo;
    });
  }

  function alternarCanal(id: string) {
    setCanaisAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  if (loading) return <p className="text-sm text-muted-foreground">{settingsConfig.loading}</p>;
  if (items.length === 0) {
    return <EmptyState illustration="generic" title="Sem marcas ativas" description="Cadastre marcas para configurar canais." />;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          {totalAtencao === 0
            ? "Todos os canais estão prontos."
            : `${totalAtencao} de ${items.length} canais precisam de atenção.`}
        </p>
        <button
          type="button"
          onClick={() => setSoAtencao((v) => !v)}
          aria-pressed={soAtencao}
          disabled={totalAtencao === 0}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
            soAtencao
              ? "border-transparent bg-warning/12 text-warning"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Só o que precisa de atenção
        </button>
      </div>

      {marcas.length === 0 ? <TudoProntoIllustration /> : (
      <div className="overflow-hidden rounded-xl border border-border">
        {marcas.map((marca) => {
          // Tudo nasce fechado: a página abre como índice, não como despejo.
          const fechada = !marcasAbertas.has(marca.brandId);
          const pendentes = marca.canais.filter(precisaAtencao).length;
          const prontos = marca.canais.length - pendentes;
          const brandColor = getBrandConfig(marca.brand)?.color ?? "var(--muted-foreground)";

          return (
            <div key={marca.brandId} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => alternarMarca(marca.brandId)}
                aria-expanded={!fechada}
                className="flex w-full items-center gap-2.5 bg-background/60 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <motion.span animate={{ rotate: fechada ? 0 : 90 }} transition={{ duration: 0.18 }} className="flex text-muted-foreground">
                  <ChevronRight size={15} />
                </motion.span>
                <AnelProgresso prontos={prontos} total={marca.canais.length} />
                <span className="text-sm font-semibold" style={{ color: brandColor }}>{marca.brandLabel}</span>
                <span className="flex-1" />
                {pendentes > 0 && <span className="text-[11px] font-semibold text-warning">{pendentes} pendente{pendentes === 1 ? "" : "s"}</span>}
                {prontos > 0 && <span className="text-[11px] font-semibold text-success">{prontos} pronto{prontos === 1 ? "" : "s"}</span>}
              </button>

              <AnimatePresence initial={false}>
                {!fechada && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    {/* As linhas entram em cascata: o olho acompanha a abertura. */}
                    <motion.div initial="hidden" animate="show" variants={cascataLinhas}>
                      {marca.canais.map((item) => (
                        <motion.div key={item.id} variants={linhaVariant}>
                          <LinhaCanal
                            item={item}
                            aberta={canaisAbertos.has(item.id)}
                            onToggle={() => alternarCanal(item.id)}
                            onChanged={onChanged}
                            mlStatus={mlStatus}
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
