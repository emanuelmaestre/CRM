"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { getBrandConfig } from "@/shared/config/brands";
import { actionDispararSincronizacaoConta, actionObterUltimaSincronizacaoConta } from "./actions";
import type { CanalConfiguracao } from "@/modules/canais/application/configuracao-canais.service";

type Execucao = NonNullable<Awaited<ReturnType<typeof actionObterUltimaSincronizacaoConta>>>;
type ModuloStatus = "pendente" | "em_andamento" | "concluido" | "erro";

const MODULOS: Array<{ chave: "catalogoStatus" | "pedidosStatus"; label: string }> = [
  { chave: "catalogoStatus", label: "Catálogo" },
  { chave: "pedidosStatus", label: "Pedidos" },
];

/** Selo de módulo com o próprio ícone e cor por estado — não é só um texto
 *  "carregando", cada situação tem uma leitura visual distinta: cinza parado,
 *  spinner girando enquanto roda, verde quando termina, vermelho se falhar. */
function SeloModulo({ label, status }: { label: string; status: ModuloStatus }) {
  const config = {
    pendente: { icon: null, cor: "var(--muted-foreground)", bg: "transparent", texto: "Na fila" },
    em_andamento: { icon: Loader2, cor: "#9B30D9", bg: "rgba(155,48,217,.08)", texto: "Sincronizando…" },
    concluido: { icon: CheckCircle2, cor: "#1F8A4C", bg: "rgba(31,138,76,.08)", texto: "Concluído" },
    erro: { icon: XCircle, cor: "#C21820", bg: "rgba(194,24,32,.08)", texto: "Falhou" },
  }[status];
  const Icon = config.icon;

  return (
    <motion.div
      layout
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ background: config.bg }}
    >
      {Icon && (
        <Icon size={12} strokeWidth={2.5} className={status === "em_andamento" ? "animate-spin" : ""} style={{ color: config.cor }} />
      )}
      <span className="text-[11px] font-semibold" style={{ color: status === "pendente" ? "var(--muted-foreground)" : config.cor }}>
        {label} · {config.texto}
      </span>
    </motion.div>
  );
}

function LinhaConta({ conta }: { conta: CanalConfiguracao }) {
  const [execucao, setExecucao] = useState<Execucao | null>(null);
  const [disparando, setDisparando] = useState(false);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararPolling = useCallback(() => {
    if (intervalo.current) clearInterval(intervalo.current);
    intervalo.current = null;
  }, []);

  const consultar = useCallback(async () => {
    if (!conta.channelAccountId) return;
    const resultado = await actionObterUltimaSincronizacaoConta(conta.channelAccountId);
    setExecucao(resultado);
    if (resultado && resultado.finalizadoEm) pararPolling();
  }, [conta.channelAccountId, pararPolling]);

  useEffect(() => {
    const task = window.setTimeout(() => void consultar(), 0);
    return () => { window.clearTimeout(task); pararPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sincronizar() {
    if (!conta.channelAccountId) return;
    setDisparando(true);
    try {
      const nova = await actionDispararSincronizacaoConta(conta.channelAccountId);
      setExecucao({ ...nova, catalogoResultado: null, pedidosResultado: null } as Execucao);
      pararPolling();
      intervalo.current = setInterval(() => void consultar(), 1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a sincronização.");
    } finally {
      setDisparando(false);
    }
  }

  const emAndamento = execucao !== null && !execucao.finalizadoEm;
  const corMarca = getBrandConfig(conta.brand)?.color;

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <ChannelLogo canal={conta.canal} size="sm" variant="badge" />
        <div>
          <p className="text-sm font-semibold text-foreground">{conta.canalLabel}</p>
          <p className="text-xs" style={{ color: corMarca }}>{conta.brandLabel}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AnimatePresence mode="popLayout">
          {execucao && (
            <motion.div
              key="status"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap items-center gap-1.5"
            >
              {MODULOS.map((modulo) => (
                <SeloModulo key={modulo.chave} label={modulo.label} status={execucao[modulo.chave] as ModuloStatus} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={sincronizar}
          disabled={disparando || emAndamento}
          className="press-feedback inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw size={13} className={disparando || emAndamento ? "animate-spin" : ""} />
          {emAndamento ? "Sincronizando…" : "Sincronizar"}
        </motion.button>
      </div>
    </div>
  );
}

/** Central de Sincronização — um "Sincronizar" por conta conectada, catálogo
 *  + pedidos rodando em background (Inngest) em vez de travar a tela por
 *  20s+ numa chamada síncrona. A tela só faz polling do status. */
export function SincronizacaoSection({ canais }: { canais: CanalConfiguracao[] }) {
  const conectadas = canais.filter((item) => item.channelAccountId && item.status === "conectado");

  if (conectadas.length === 0) {
    return <p className="text-sm text-muted-foreground">Conecte uma conta de canal para poder sincronizar.</p>;
  }

  return (
    <div>
      {conectadas.map((conta) => (
        <LinhaConta key={conta.channelAccountId} conta={conta} />
      ))}
    </div>
  );
}
