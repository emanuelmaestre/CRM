"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Check, ChevronDown, MessageCircle } from "lucide-react";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import settingsConfig from "@/config/settings.json";
import { tint } from "@/shared/design-system/color";
import { springs } from "@/shared/design-system/motion-variants";
import { CATALOGO_AUTOMACOES_WHATSAPP, CATEGORIA_COR_AUTOMACAO } from "@/shared/lib/whatsapp/catalogo-automacoes";
import { actionListarHistoricoAutomacoes, actionStatusAutomacoesWhatsApp } from "./actions";

const copy = settingsConfig.automacoes;

type Historico = Awaited<ReturnType<typeof actionListarHistoricoAutomacoes>>;

function dataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function rotuloBloqueio(valor: string | null): string {
  if (!valor) return "Sem bloqueio";
  const numero = valor.match(/^gate_(\d+)$/i)?.[1];
  return numero ? `Bloqueio ${numero}` : valor.replaceAll("_", " ").replace(/\bgate\b/gi, "bloqueio");
}

const horaAgora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());

/** Troca {placeholder} por uma pilulazinha destacada e *texto* pelo negrito
 *  que o WhatsApp de verdade renderiza — a prévia fica fiel ao que chega no
 *  celular, não só ao texto cru do modelo. */
function TextoComPlaceholder({ texto }: { texto: string }) {
  const partes = texto.split(/(\{[^}]+\}|\*[^*]+\*)/g);
  return (
    <>
      {partes.map((parte, indice) => {
        if (parte.startsWith("{") && parte.endsWith("}")) {
          return (
            <span
              key={indice}
              className="mx-[1px] inline-block rounded-[0.3rem] bg-black/8 px-1 font-mono text-[10.5px] font-semibold text-[#075e54]"
            >
              {parte.slice(1, -1)}
            </span>
          );
        }
        if (parte.startsWith("*") && parte.endsWith("*") && parte.length > 2) {
          return <strong key={indice}>{parte.slice(1, -1)}</strong>;
        }
        return <span key={indice}>{parte}</span>;
      })}
    </>
  );
}

/** Três bolinhas subindo e descendo em sequência — o indicador "digitando…"
 *  real do WhatsApp, não um spinner genérico. */
function PontosDigitando() {
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2].map((indice) => (
        <motion.span
          key={indice}
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: "#4a5b52" }}
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: indice * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

/** Prévia fiel de como o aviso chega de verdade — cabeçalho de contato,
 *  "digitando…" antes do texto surgir, bolha verde, rabinho, hora e check
 *  duplo, igual ao WhatsApp. É o "me surpreenda": em vez de só listar o
 *  texto do modelo, mostra a mensagem no contexto em que o admin vai
 *  realmente lê-la — e deixa claro, pelo cabeçalho, que é um modelo/prévia,
 *  não uma conversa real acontecendo agora.
 *
 *  As cores aqui dentro (#dcf8c6, #111b21, #4a5b52, #53bdeb, #075e54...) são
 *  as cores reais do WhatsApp, não os tokens do CRM — exceção deliberada,
 *  porque o objetivo é imitar o app de terceiro, não a nossa identidade
 *  visual. */
function BolhaWhatsApp({ modelo }: { modelo: string }) {
  const reduzir = useReducedMotion();
  const [digitando, setDigitando] = useState(!reduzir);

  useEffect(() => {
    if (reduzir) return;
    const tempo = setTimeout(() => setDigitando(false), 1100);
    return () => clearTimeout(tempo);
  }, [reduzir]);

  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springs.settleFast}
      className="ml-11 mt-2 max-w-[22rem] overflow-hidden rounded-lg shadow-sm"
    >
      {/* Cabeçalho de contato — comunica "isto é um modelo/prévia de como o
          aviso chega no WhatsApp", não uma conversa real acontecendo. */}
      <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: "#075e54" }}>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
          <Bot size={13} strokeWidth={2} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[11px] font-semibold text-white">Avisos automáticos · CRM</p>
          <p className="text-[9.5px] text-white/70">modelo de mensagem</p>
        </div>
      </div>

      <div className="relative px-3 py-2" style={{ background: "#dcf8c6" }}>
        <span
          className="absolute -left-[7px] top-0 h-0 w-0"
          style={{ borderTop: "8px solid #dcf8c6", borderLeft: "8px solid transparent" }}
          aria-hidden="true"
        />
        <AnimatePresence mode="wait" initial={false}>
          {digitando ? (
            <motion.div
              key="digitando"
              initial={reduzir ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center py-[3px]"
            >
              <PontosDigitando />
            </motion.div>
          ) : (
            <motion.div
              key="texto"
              initial={reduzir ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#111b21]">
                <TextoComPlaceholder texto={modelo} />
              </p>
              <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#4a5b52]">
                {horaAgora}
                <Check size={12} className="-mr-1.5" strokeWidth={2.5} />
                <Check size={12} strokeWidth={2.5} style={{ color: "#53bdeb" }} />
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Cor por categoria vem de catalogo-automacoes.ts — compartilhada com o
// sino de notificações, que lista os mesmos eventos.
const CATEGORIA_COR = CATEGORIA_COR_AUTOMACAO;

/** Os avisos de WhatsApp já existem e já disparam — só não tinham lugar
 *  nenhum na tela pra dizer "isso aqui está ligado". Mora acima do histórico
 *  de réguas porque é a automação que já funciona hoje; réguas ainda não
 *  podem ser criadas pelo sistema (ver comentário mais abaixo).
 *
 *  Lista única em vez de uma caixa por categoria: com só 1 item em Atendimento
 *  contra 3 em Operacional, caixas separadas deixavam a grade toda torta. Uma
 *  lista com a cor da categoria na bolinha carrega o mesmo agrupamento sem
 *  depender de altura igual entre grupos. */
function AutomacoesWhatsApp() {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const reduzir = useReducedMotion();

  useEffect(() => {
    actionStatusAutomacoesWhatsApp()
      .then((resultado) => setAtivo(resultado.ativo))
      .catch(() => setAtivo(false));
  }, []);

  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.06em] text-muted-foreground">
          <MessageCircle size={13} />
          Avisos automáticos no WhatsApp
        </p>
        {ativo !== null && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{
              background: tint(ativo ? "var(--success)" : "var(--muted-foreground)", 10),
              color: ativo ? "var(--success)" : "var(--muted-foreground)",
            }}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${ativo ? "bg-success" : "bg-muted-foreground"}`} />
            {ativo ? "Ativo" : "Configure a Z-API para ligar"}
          </span>
        )}
      </div>

      {/* Substitui a legenda estática que morava no Card (page.tsx) — o
          número e o tom mudam de verdade com o estado da integração, em vez
          de repetir sempre o mesmo texto genérico. */}
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        {ativo === null
          ? "Carregando status da integração…"
          : ativo
            ? `${CATALOGO_AUTOMACOES_WHATSAPP.length} avisos automáticos ligados no WhatsApp — cobrindo estoque, atendimento, vendas e operação.`
            : `Configure a Z-API para começar a receber os ${CATALOGO_AUTOMACOES_WHATSAPP.length} avisos abaixo no WhatsApp.`}
      </p>

      <ul className="divide-y divide-border overflow-hidden rounded-[0.9rem] border border-border bg-background/60">
        {CATALOGO_AUTOMACOES_WHATSAPP.map((item, indice) => {
          const cor = CATEGORIA_COR[item.categoria];
          const aberto = expandido === item.chave;
          const novaCategoria = indice === 0 || CATALOGO_AUTOMACOES_WHATSAPP[indice - 1].categoria !== item.categoria;
          return (
            <li key={item.chave} className="px-4 py-3">
              {novaCategoria && (
                <p
                  className="mb-2 -mt-0.5 text-[10px] font-bold uppercase tracking-[.06em]"
                  style={{ color: cor }}
                >
                  {item.categoria}
                </p>
              )}
              <button
                type="button"
                onClick={() => setExpandido((atual) => atual === item.chave ? null : item.chave)}
                aria-expanded={aberto}
                className="flex w-full items-start gap-3 text-left"
              >
                <span
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: tint(cor, 12), color: cor }}
                >
                  <item.icone size={15} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-foreground">{item.titulo}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{item.tom}</p>
                </div>
                <motion.span
                  animate={{ rotate: aberto ? 180 : 0 }}
                  transition={reduzir ? { duration: 0 } : springs.settleFast}
                  className="mt-1.5 shrink-0 text-muted-foreground"
                >
                  <ChevronDown size={15} />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {aberto && (
                  <motion.div
                    initial={reduzir ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={springs.settleFast}
                    className="overflow-hidden"
                  >
                    <BolhaWhatsApp modelo={item.modelo} />
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Histórico das réguas de relacionamento.
 *
 *  Deixou de ser um módulo próprio no menu: é só leitura e, sem régua
 *  cadastrada, permanece vazio — não sustenta um item de navegação. Como seção
 *  de Configurações fica junto do resto da operação, onde é consultada. */
export function AutomacoesSection() {
  const [dados, setDados] = useState<Historico | null>(null);

  const carregar = useCallback(() => {
    actionListarHistoricoAutomacoes()
      .then(setDados)
      .catch(() => {
        setDados({ execucoes: [], reguasCadastradas: 0 });
        toast.error(copy.loadError);
      });
  }, []);

  useEffect(carregar, [carregar]);

  return (
    <>
      <AutomacoesWhatsApp />

      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.06em] text-muted-foreground">
        Réguas de relacionamento
      </p>

      {dados === null ? <SkeletonRow /> : dados.execucoes.length === 0 ? (
        // Distingue os dois vazios: sem régua nenhuma, não há o que executar — e
        // dizer só "nenhuma execução" faria parecer defeito. Com régua
        // cadastrada, o vazio passa a ser informação real (nada disparou ainda).
        <div className="rounded-xl border border-dashed border-border px-4 py-5">
          <p className="text-sm text-muted-foreground">
            {dados.reguasCadastradas === 0 ? copy.emptyNoRules : copy.emptyNoRuns}
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                {copy.columns.map((coluna) => (
                  <th key={coluna} className="px-3 py-2 font-semibold">{coluna}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dados.execucoes.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 whitespace-nowrap">{dataHora(item.createdAt)}</td>
                  <td className="px-3 py-2.5 font-semibold">{item.reguaNome}</td>
                  <td className="px-3 py-2.5">{item.clienteNome}</td>
                  <td className="px-3 py-2.5">{item.brandNome}</td>
                  <td className="px-3 py-2.5 capitalize">{item.status.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2.5">{rotuloBloqueio(item.gate)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{item.motivo ?? "Sem motivo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
