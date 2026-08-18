"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, MessageCircle } from "lucide-react";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import settingsConfig from "@/config/settings.json";
import { tint } from "@/shared/design-system/color";
import { springs } from "@/shared/design-system/motion-variants";
import { CATALOGO_AUTOMACOES_WHATSAPP, type AutomacaoWhatsApp } from "@/shared/lib/whatsapp/catalogo-automacoes";
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
              className="mx-[1px] inline-block rounded-[0.3rem] bg-black/8 px-1 font-mono text-[10.5px] font-semibold text-[#075e54] dark:bg-white/12 dark:text-[#e9fbe7]"
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

/** Prévia fiel de como o aviso chega de verdade — bolha verde, rabinho,
 *  hora e check duplo, igual ao WhatsApp. É o "me surpreenda": em vez de só
 *  listar o texto do modelo, mostra a mensagem no contexto em que o admin
 *  vai realmente lê-la. */
function BolhaWhatsApp({ modelo }: { modelo: string }) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      initial={reduzir ? false : { opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springs.settleFast}
      className="relative ml-11 mt-2 max-w-[22rem] rounded-lg rounded-tl-none px-3 py-2 shadow-sm"
      style={{ background: "#dcf8c6" }}
    >
      <span
        className="absolute -left-[7px] top-0 h-0 w-0"
        style={{ borderTop: "8px solid #dcf8c6", borderLeft: "8px solid transparent" }}
        aria-hidden="true"
      />
      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#111b21]">
        <TextoComPlaceholder texto={modelo} />
      </p>
      <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#4a5b52]">
        {horaAgora}
        <Check size={12} className="-mr-1.5" strokeWidth={2.5} />
        <Check size={12} strokeWidth={2.5} style={{ color: "#53bdeb" }} />
      </span>
    </motion.div>
  );
}

// Cada categoria com a própria cor de identidade — mesmo princípio usado em
// Usuários (perfil) e no resto do sistema (marca, canal): cor tingida em vez
// de tudo cinza. Não é severidade (nenhuma delas é "pior" que a outra), só
// agrupamento visual.
const CATEGORIA_COR: Record<AutomacaoWhatsApp["categoria"], string> = {
  "Estoque": "var(--acento-2)",
  "Atendimento": "var(--info)",
  "Vendas & pós-venda": "var(--acento-3)",
  "Relacionamento": "var(--acento-1)",
  "Operacional": "var(--warning)",
};

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
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base leading-none"
                  style={{ background: tint(cor, 12) }}
                >
                  {item.emoji}
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
                  <td className="px-3 py-2.5">{item.gate ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{item.motivo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
