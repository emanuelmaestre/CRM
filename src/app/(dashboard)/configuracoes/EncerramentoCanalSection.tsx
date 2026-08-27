"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, KeyRound, Loader2, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { fadeUp, springs, stagger, variantes } from "@/shared/design-system/motion-variants";
import { tint } from "@/shared/design-system/color";
import {
  actionAutorizarExclusaoCanal,
  actionEncerrarRelacaoCanal,
  actionExecutarExclusaoCanal,
  actionListarCanaisEncerramento,
  actionReabrirRelacaoCanal,
} from "./actions";

type Canal = Awaited<ReturnType<typeof actionListarCanaisEncerramento>>[number];

const ASSINATURAS_NECESSARIAS = 3;
const CONFIRMACAO = "EXCLUIR DADOS";

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
});

const ROTULO_CANAL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktokshop: "TikTok Shop",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  gmail: "Gmail",
  gcalendar: "Google Agenda",
  cobranca: "Cobrança",
};

/** Marcador de quantas das três assinaturas já entraram. Três pontos em vez
 *  de "1/3" porque o que importa aqui é enxergar de relance quanto falta. */
function Assinaturas({ total }: { total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${total} de ${ASSINATURAS_NECESSARIAS} autorizações`}>
      {Array.from({ length: ASSINATURAS_NECESSARIAS }, (_, i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full transition-colors"
          style={{ background: i < total ? "var(--success)" : "var(--border)" }}
        />
      ))}
    </span>
  );
}

function Etiqueta({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ background: tint(cor, 10), color: cor }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
      {children}
    </span>
  );
}

export function EncerramentoCanalSection() {
  const reduzir = useReducedMotion();
  const [canais, setCanais] = useState<Canal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Callback síncrono resolvendo no `.then`, e não `async` chamado dentro do
  // efeito: é o padrão das outras seções desta página (ver BackupSection) e o
  // que evita o setState síncrono dentro do efeito.
  const carregar = useCallback(() => {
    actionListarCanaisEncerramento()
      .then(setCanais)
      .catch((erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao carregar os canais."))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(carregar, [carregar]);

  const fecharPainel = useCallback(() => {
    setAberto(null);
    setSenha("");
    setConfirmacao("");
  }, []);

  async function executar(id: string, tarefa: () => Promise<unknown>, sucesso: string) {
    setOcupado(id);
    try {
      await tarefa();
      toast.success(sucesso);
      carregar();
      return true;
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  // Todas as contas aparecem, inclusive as que ainda não têm comprador
  // nenhum. Esconder as vazias era mais limpo, mas deixava de fora justamente
  // o canal que uma plataforma recém-conectada teria — e é a ela que se
  // precisa demonstrar que o mecanismo de exclusão cobre o canal dela.
  const relevantes = canais;

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-6 text-[12.5px] text-muted-foreground">
        <Loader2 size={15} className="animate-spin" />
        Carregando canais…
      </div>
    );
  }

  if (relevantes.length === 0) {
    return (
      <p className="py-4 text-[12.5px] text-muted-foreground">
        Nenhuma conta de canal cadastrada.
      </p>
    );
  }

  return (
    <motion.ul
      variants={variantes(reduzir, stagger)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-2.5"
    >
      {relevantes.map((canal) => {
        const excluido = Boolean(canal.dadosExcluidosEm);
        const encerrado = Boolean(canal.encerradoEm) && !excluido;
        const liberado = canal.assinaturas >= ASSINATURAS_NECESSARIAS;
        const faltam = Math.max(0, ASSINATURAS_NECESSARIAS - canal.assinaturas);
        const estaAberto = aberto === canal.id;
        const trabalhando = ocupado === canal.id;

        return (
          <motion.li
            key={canal.id}
            variants={variantes(reduzir, fadeUp)}
            className="rounded-[0.9rem] border border-border bg-card p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-foreground">{canal.nome}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {ROTULO_CANAL[canal.tipo] ?? canal.tipo}
                  {" · "}
                  {canal.clientesAfetados === 0
                    ? "nenhum comprador ainda"
                    : `${canal.clientesAfetados} ${canal.clientesAfetados === 1 ? "comprador" : "compradores"}`}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                {excluido ? (
                  <Etiqueta cor="var(--muted-foreground)">
                    Excluído em {dataHora.format(new Date(canal.dadosExcluidosEm!))}
                  </Etiqueta>
                ) : encerrado ? (
                  <>
                    <Assinaturas total={canal.assinaturas} />
                    <Etiqueta cor={liberado ? "var(--destructive)" : "var(--warning)"}>
                      {liberado ? "Liberado para excluir" : `Faltam ${faltam}`}
                    </Etiqueta>
                  </>
                ) : canal.clientesAfetados === 0 ? (
                  // Sem comprador não há o que excluir, e dizer isso é mais
                  // honesto do que "Relação ativa" numa conta que nunca vendeu.
                  <Etiqueta cor="var(--muted-foreground)">Sem dados de comprador</Etiqueta>
                ) : (
                  <Etiqueta cor="var(--success)">Relação ativa</Etiqueta>
                )}
              </div>
            </div>

            {!excluido && (
              <div className="mt-3 flex flex-wrap gap-2">
                {!encerrado ? (
                  <button
                    type="button"
                    disabled={trabalhando}
                    onClick={() => void executar(
                      canal.id,
                      () => actionEncerrarRelacaoCanal(canal.id),
                      "Relação encerrada. A exclusão ainda precisa de três autorizações.",
                    )}
                    className="press-feedback inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {trabalhando ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                    Encerrar relação
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() => (estaAberto ? fecharPainel() : (setAberto(canal.id), setSenha(""), setConfirmacao("")))}
                      className="press-feedback inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <KeyRound size={13} />
                      {estaAberto ? "Cancelar" : "Autorizar com minha senha"}
                    </button>
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() => void executar(
                        canal.id,
                        () => actionReabrirRelacaoCanal(canal.id),
                        "Encerramento desfeito. As autorizações foram descartadas.",
                      )}
                      className="press-feedback inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <RotateCcw size={13} />
                      Desfazer encerramento
                    </button>
                    {liberado && (
                      <button
                        type="button"
                        disabled={trabalhando}
                        onClick={() => void executar(
                          canal.id,
                          () => actionExecutarExclusaoCanal(canal.id),
                          "Dados do canal excluídos.",
                        )}
                        className="press-feedback inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: "var(--destructive)" }}
                      >
                        {trabalhando ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                        Executar exclusão
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <AnimatePresence initial={false}>
              {estaAberto && (
                <motion.form
                  key="painel"
                  initial={reduzir ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduzir ? undefined : { height: 0, opacity: 0 }}
                  transition={springs.settleFast}
                  className="overflow-hidden"
                  onSubmit={async (evento) => {
                    evento.preventDefault();
                    const ok = await executar(
                      canal.id,
                      () => actionAutorizarExclusaoCanal({
                        channelAccountId: canal.id,
                        senha,
                        confirmacao,
                      }),
                      "Autorização registrada.",
                    );
                    if (ok) fecharPainel();
                  }}
                >
                  <div className="mt-3 flex flex-col gap-2.5 rounded-[0.75rem] border border-border bg-muted/40 p-3">
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      Sua assinatura vale por uma. São necessárias{" "}
                      <strong className="text-foreground">três pessoas diferentes</strong>, cada uma
                      com a própria senha. A exclusão anonimiza o comprador e não pode ser desfeita;
                      os pedidos continuam, sem dono.
                    </p>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Sua senha"
                      className="rounded-[0.6rem] border border-border bg-card px-3 py-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <input
                      type="text"
                      value={confirmacao}
                      onChange={(e) => setConfirmacao(e.target.value)}
                      placeholder={`Digite ${CONFIRMACAO}`}
                      className="rounded-[0.6rem] border border-border bg-card px-3 py-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      type="submit"
                      disabled={trabalhando || !senha || confirmacao !== CONFIRMACAO}
                      className="press-feedback inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{ background: "var(--foreground)" }}
                    >
                      {trabalhando ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                      Registrar minha autorização
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
