"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, KeyRound, Loader2, RotateCcw } from "lucide-react";
import { eases, fadeUp, springs, stagger, variantes } from "@/shared/design-system/motion-variants";
import { tint, TINTA } from "@/shared/design-system/color";
import { getBrandConfig } from "@/shared/config/brands";
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

const numero = new Intl.NumberFormat("pt-BR");
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

/** Ordem em que os canais aparecem: primeiro os que vendem, que são os que
 *  acumulam dado de comprador. O resto vai para o fim porque nunca terá o que
 *  excluir — não some da lista, mas não disputa o topo. */
const ORDEM_CANAL = ["mercadolivre", "shopee", "tiktokshop"];

function corDaMarca(slug: string): string {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

/** As três assinaturas. Cada uma "carimba" ao entrar — spring curta, só nesse
 *  instante — em vez de aparecer pronta, porque assinar é um ato e a tela
 *  deve mostrar que algo aconteceu. */
function Assinaturas({ total, reduzir }: { total: number; reduzir: boolean | null }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label={`${total} de ${ASSINATURAS_NECESSARIAS} autorizações`}
    >
      {Array.from({ length: ASSINATURAS_NECESSARIAS }, (_, i) => {
        const assinada = i < total;
        return (
          <motion.span
            key={i}
            initial={false}
            animate={assinada && !reduzir ? { scale: [0.6, 1] } : { scale: 1 }}
            transition={springs.settleFast}
            className="flex h-4 w-4 items-center justify-center rounded-full"
            style={{
              background: assinada ? tint("var(--success)", 14) : "transparent",
              border: assinada ? "none" : "1px dashed var(--border)",
            }}
          >
            {assinada && <Check size={10} strokeWidth={3} className="text-success" />}
          </motion.span>
        );
      })}
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

  const carregar = useCallback(() => {
    actionListarCanaisEncerramento()
      .then(setCanais)
      .catch((erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao carregar os canais."))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(carregar, [carregar]);

  const grupos = useMemo(() => {
    const porCanal = new Map<string, Canal[]>();
    for (const canal of canais) {
      const lista = porCanal.get(canal.tipo) ?? [];
      lista.push(canal);
      porCanal.set(canal.tipo, lista);
    }
    return [...porCanal.entries()].sort(([a], [b]) => {
      const ia = ORDEM_CANAL.indexOf(a);
      const ib = ORDEM_CANAL.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [canais]);

  // A barra é proporcional ao MAIOR volume da tela, não ao total. Comparar
  // 3.140 com 17 pelo total daria duas barras invisíveis; pelo maior, a
  // diferença de escala entre as contas aparece de imediato.
  const maior = useMemo(
    () => Math.max(1, ...canais.map((c) => c.clientesAfetados)),
    [canais],
  );

  function fecharPainel() {
    setAberto(null);
    setSenha("");
    setConfirmacao("");
  }

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

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-6 text-[12.5px] text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        Carregando canais…
      </div>
    );
  }

  if (canais.length === 0) {
    return (
      <p className="py-4 text-[12.5px] text-muted-foreground">
        Nenhuma conta de canal cadastrada.
      </p>
    );
  }

  return (
    <motion.div
      variants={variantes(reduzir, stagger)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-6"
    >
      {grupos.map(([tipo, contas]) => {
        const totalCanal = contas.reduce((s, c) => s + c.clientesAfetados, 0);

        return (
          <motion.section key={tipo} variants={variantes(reduzir, fadeUp)}>
            <header className="mb-2 flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {ROTULO_CANAL[tipo] ?? tipo}
              </h3>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {totalCanal === 0
                  ? "sem compradores"
                  : `${numero.format(totalCanal)} ${totalCanal === 1 ? "comprador" : "compradores"}`}
              </span>
            </header>

            <ul className="flex flex-col">
              {contas.map((canal) => {
                const excluido = Boolean(canal.dadosExcluidosEm);
                const encerrado = Boolean(canal.encerradoEm) && !excluido;
                const liberado = canal.assinaturas >= ASSINATURAS_NECESSARIAS;
                const faltam = Math.max(0, ASSINATURAS_NECESSARIAS - canal.assinaturas);
                const estaAberto = aberto === canal.id;
                const trabalhando = ocupado === canal.id;
                const vazio = canal.clientesAfetados === 0;
                const cor = corDaMarca(canal.brandSlug);

                return (
                  <li key={canal.id} className="border-b border-border/60 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => (estaAberto ? fecharPainel() : (setAberto(canal.id), setSenha(""), setConfirmacao("")))}
                      aria-expanded={estaAberto}
                      className="press-feedback flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {/* Espinha na cor da marca: diz de quem é o dado antes
                          de qualquer texto ser lido. */}
                      <span
                        aria-hidden
                        className="h-8 w-[3px] shrink-0 rounded-full"
                        style={{ background: vazio ? "var(--border)" : cor, opacity: vazio ? 1 : 0.9 }}
                      />

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-[13px] font-bold ${excluido ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {canal.nome}
                          </span>
                          {encerrado && !liberado && (
                            <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--warning)" }}>
                              faltam {faltam}
                            </span>
                          )}
                          {encerrado && liberado && (
                            <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--destructive)" }}>
                              pronto para excluir
                            </span>
                          )}
                        </span>

                        {/* A barra proporcional. Uma linha fina, e só ela —
                            é a única "ilustração" da seção, e é dado real. */}
                        <span className="mt-1 flex h-[3px] w-full overflow-hidden rounded-full bg-muted">
                          {!vazio && (
                            <motion.span
                              initial={reduzir ? false : { width: 0 }}
                              animate={{ width: `${Math.max(2, (canal.clientesAfetados / maior) * 100)}%` }}
                              transition={{ duration: 0.6, ease: eases.emphasized }}
                              className="block h-full rounded-full"
                              style={{ background: excluido ? "var(--border)" : cor }}
                            />
                          )}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-3">
                        {encerrado && <Assinaturas total={canal.assinaturas} reduzir={reduzir} />}
                        <span className="w-16 text-right">
                          {excluido ? (
                            <span className="text-[11px] text-muted-foreground">excluído</span>
                          ) : vazio ? (
                            <span className="text-[15px] text-muted-foreground/50">—</span>
                          ) : (
                            <span className="text-[15px] font-bold tabular-nums text-foreground">
                              {numero.format(canal.clientesAfetados)}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {estaAberto && (
                        <motion.div
                          initial={reduzir ? false : { height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={reduzir ? undefined : { height: 0, opacity: 0 }}
                          transition={springs.drawer}
                          className="overflow-hidden"
                        >
                          <div className="pb-3.5 pl-[15px]">
                            {excluido ? (
                              <p className="text-[12px] text-muted-foreground">
                                Dados excluídos em {dataHora.format(new Date(canal.dadosExcluidosEm!))}.
                                Os pedidos seguem no histórico, sem vínculo com o comprador.
                              </p>
                            ) : !encerrado ? (
                              <div className="flex flex-wrap items-center gap-3">
                                <p className="flex-1 text-[12px] leading-relaxed text-muted-foreground">
                                  {vazio
                                    ? "Este canal ainda não trouxe comprador nenhum, então não há dado pessoal a excluir. Encerrar a relação registra a data e bloqueia nova coleta."
                                    : `Encerrar registra a data e para a coleta. A exclusão dos dados de ${numero.format(canal.clientesAfetados)} ${canal.clientesAfetados === 1 ? "comprador" : "compradores"} é um passo à parte, e precisa de três administradores.`}
                                </p>
                                <button
                                  type="button"
                                  disabled={trabalhando}
                                  onClick={() => void executar(
                                    canal.id,
                                    () => actionEncerrarRelacaoCanal(canal.id),
                                    "Relação encerrada.",
                                  )}
                                  className="press-feedback inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                                >
                                  {trabalhando && <Loader2 size={12} className="animate-spin" />}
                                  Encerrar relação
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-3">
                                <p className="text-[12px] leading-relaxed text-muted-foreground">
                                  Encerrada em {dataHora.format(new Date(canal.encerradoEm!))}.{" "}
                                  {liberado
                                    ? "As três autorizações estão dadas. A exclusão anonimiza o comprador e não pode ser desfeita; os pedidos continuam, sem dono."
                                    : `Sua assinatura vale por uma. São necessárias três pessoas diferentes, cada uma com a própria senha.`}
                                </p>

                                <form
                                  className="flex flex-col gap-2 sm:flex-row sm:items-center"
                                  onSubmit={async (evento) => {
                                    evento.preventDefault();
                                    const ok = await executar(
                                      canal.id,
                                      () => actionAutorizarExclusaoCanal({
                                        channelAccountId: canal.id, senha, confirmacao,
                                      }),
                                      "Autorização registrada.",
                                    );
                                    if (ok) { setSenha(""); setConfirmacao(""); }
                                  }}
                                >
                                  <input
                                    type="password"
                                    autoComplete="current-password"
                                    value={senha}
                                    onChange={(e) => setSenha(e.target.value)}
                                    placeholder="Sua senha"
                                    className="min-w-0 flex-1 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  />
                                  <input
                                    type="text"
                                    value={confirmacao}
                                    onChange={(e) => setConfirmacao(e.target.value)}
                                    placeholder={CONFIRMACAO}
                                    className="min-w-0 flex-1 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  />
                                  <button
                                    type="submit"
                                    disabled={trabalhando || !senha || confirmacao !== CONFIRMACAO}
                                    className="press-feedback inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                                    style={{ background: "var(--foreground)" }}
                                  >
                                    <KeyRound size={12} />
                                    Autorizar
                                  </button>
                                </form>

                                <div className="flex flex-wrap items-center gap-2">
                                  {liberado && (
                                    <button
                                      type="button"
                                      disabled={trabalhando}
                                      onClick={() => void executar(
                                        canal.id,
                                        () => actionExecutarExclusaoCanal(canal.id),
                                        "Dados do canal excluídos.",
                                      )}
                                      className="press-feedback inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors"
                                      style={{
                                        background: tint("var(--destructive)", TINTA.bloco),
                                        color: "var(--destructive)",
                                      }}
                                    >
                                      {trabalhando && <Loader2 size={12} className="animate-spin" />}
                                      Excluir dados agora
                                    </button>
                                  )}
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
                                    <RotateCcw size={12} />
                                    Desfazer encerramento
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        );
      })}
    </motion.div>
  );
}
