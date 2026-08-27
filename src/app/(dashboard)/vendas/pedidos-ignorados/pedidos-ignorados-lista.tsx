"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CircleSlash, Loader2, PackageX, RotateCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { isBrandSlug } from "@/shared/config/brands";
import { moeda } from "@/shared/design-system/format";
import { springs } from "@/shared/design-system/motion-variants";
import type { PedidoIgnoradoLinha } from "@/modules/vendas/application/pedidos-ignorados.service";
import { actionDescartarPedidoIgnorado, actionReprocessarPedidoIgnorado } from "./actions";

/* Cada causa recebe o texto da AÇÃO, não a mensagem crua do erro. Mostrar só
   o `motivo` fazia as quatro parecerem a mesma coisa — e só uma delas se
   resolve mexendo na loja. */
const CAUSAS: Record<string, { rotulo: string; acao: string }> = {
  sku_sem_produto: {
    rotulo: "SKU sem produto",
    acao: "O produto deste SKU ainda não existe no CRM. Costuma entrar sozinho quando o catálogo do canal sincroniza.",
  },
  cliente_duplicado: {
    rotulo: "Cliente duplicado",
    acao: "O comprador colidiu com um cadastro existente — na Shopee o telefone vem mascarado, e compradores diferentes caem no mesmo valor. Resolve-se no CRM, não na loja.",
  },
  payload_invalido: {
    rotulo: "Formato inesperado",
    acao: "O canal devolveu o pedido fora do formato esperado. É problema do CRM: tentar de novo daria exatamente o mesmo erro.",
  },
  desconhecida: {
    rotulo: "Não classificada",
    acao: "Falha ainda sem classificação própria.",
  },
};

function diasParado(desde: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000));
}

function dataCurta(valor: string | Date | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function Pendencia({ linha, podeDescartar }: {
  linha: PedidoIgnoradoLinha;
  podeDescartar: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const reduzir = useReducedMotion();
  const causa = CAUSAS[linha.causa] ?? CAUSAS.desconhecida;
  const fechado = linha.descartadoEm !== null;

  function reprocessar() {
    iniciar(async () => {
      const resultado = await actionReprocessarPedidoIgnorado(linha.id);
      if (resultado.ok) {
        toast.success(resultado.jaExistia
          ? `Pedido ${linha.providerOrderId} já estava no CRM — pendência encerrada.`
          : `Pedido ${linha.providerOrderId} entrou.`);
      } else {
        // O erro novo pode ser DIFERENTE do antigo (o SKU entrou e agora
        // barra o cliente) — por isso a mensagem vem do resultado, não do
        // texto que já estava na tela.
        toast.error(`Ainda não entrou: ${resultado.motivo}`, { duration: 8000 });
      }
      // Busca o estado real em vez de adivinhar: quando o replay falha, a
      // linha CONTINUA na fila, agora com a causa e o motivo regravados.
      router.refresh();
    });
  }

  function descartar(desfazer: boolean) {
    iniciar(async () => {
      await actionDescartarPedidoIgnorado(linha.id, desfazer);
      toast.success(desfazer ? "Pendência devolvida à fila." : "Pendência descartada.");
      // Busca o estado real em vez de adivinhar: quando o replay falha, a
      // linha CONTINUA na fila, agora com a causa e o motivo regravados.
      router.refresh();
    });
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={reduzir ? { duration: 0 } : springs.settleFast}
      className={`rounded-[0.9rem] border border-border bg-card p-4 ${fechado ? "opacity-55" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold text-foreground">{linha.providerOrderId}</span>
        <ChannelLogo canal={linha.canal} size="sm" variant="logo" />
        {isBrandSlug(linha.marcaSlug)
          ? <BrandLogo brand={linha.marcaSlug} height={15} />
          : <span className="text-xs font-semibold text-muted-foreground">{linha.marca}</span>}
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
          {causa.rotulo}
        </span>
        {fechado && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            Descartado
          </span>
        )}
        <span className="ml-auto text-[11px] font-semibold tabular-nums text-muted-foreground">
          {dataCurta(linha.pedidoEm)} · parado há {diasParado(linha.primeiraVezEm)}d · {linha.tentativas}
          {linha.tentativas === 1 ? " tentativa" : " tentativas"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">{linha.compradorNome ?? "Comprador não informado"}</span>
        {linha.total && (
          <span className="tabular-nums text-muted-foreground">{moeda.format(Number(linha.total))}</span>
        )}
      </div>

      {linha.skus.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {linha.skus.map((sku) => (
            <span key={sku} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{sku}</span>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{causa.acao}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Sem botão de reprocessar em `payload_invalido`: a falha é
            determinística — mesmo payload, mesmo validador, mesmo erro.
            Oferecer o botão ali só gasta o tempo de quem clica. */}
        {linha.reprocessavel && !fechado && (
          <button
            type="button"
            onClick={reprocessar}
            disabled={pendente}
            className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {pendente ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
            Tentar novamente
          </button>
        )}
        {podeDescartar && (
          <button
            type="button"
            onClick={() => descartar(fechado)}
            disabled={pendente}
            className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {fechado ? <Undo2 size={13} /> : <CircleSlash size={13} />}
            {fechado ? "Devolver à fila" : "Não recuperável"}
          </button>
        )}
      </div>
    </motion.li>
  );
}

export function PedidosIgnoradosLista({ linhas, podeDescartar, incluirFechados }: {
  linhas: PedidoIgnoradoLinha[];
  podeDescartar: boolean;
  incluirFechados: boolean;
}) {
  // A lista vem direto das props, sem cópia em estado local.
  //
  // A primeira versão guardava `useState(linhasIniciais)` e removia a linha
  // na mão depois de cada ação. Dois defeitos: `useState` ignora props novas,
  // então o `revalidatePath` da action recarregava o servidor e a tela
  // continuava mostrando a lista velha; e a remoção era feita mesmo quando o
  // reprocessamento FALHAVA — a pendência sumia da tela sem ter saído da
  // fila, reaparecendo no próximo carregamento. Agora quem manda é o
  // servidor, e `router.refresh()` traz o estado real depois de cada ação.
  const abertas = linhas.filter((linha) => linha.descartadoEm === null).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Pedidos ignorados"
        description="Pedidos que o canal entregou e o CRM não conseguiu importar. A fila se limpa sozinha na próxima sincronização quando a causa deixa de existir."
        actions={
          <a
            href={incluirFechados ? "/vendas/pedidos-ignorados" : "/vendas/pedidos-ignorados?historico=1"}
            className="press-feedback inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted"
          >
            {incluirFechados ? "Ver só a fila aberta" : "Ver histórico completo"}
          </a>
        }
      />

      {linhas.length === 0 ? (
        <EmptyState
          title="Nenhum pedido ignorado"
          description="Todos os pedidos que os canais entregaram foram importados."
          illustration="generic"
        />
      ) : (
        <>
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            {abertas} {abertas === 1 ? "pendência aberta" : "pendências abertas"}
            {incluirFechados && ` · ${linhas.length - abertas} fechadas`}
          </p>
          <motion.ul layout className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {linhas.map((linha) => (
                <Pendencia key={linha.id} linha={linha} podeDescartar={podeDescartar} />
              ))}
            </AnimatePresence>
          </motion.ul>
        </>
      )}
    </div>
  );
}
