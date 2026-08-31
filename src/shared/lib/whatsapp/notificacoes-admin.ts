import { eq } from "drizzle-orm";
import { brand, conversa, channelAccount, pedido, produto } from "@/shared/lib/db/schema";
import { getBrandConfig } from "@/shared/config/brands";
import channelsConfig from "@/config/channels.json";
import { enviarTextoZApi, zapiConfigurado } from "./zapi-client";
import type { DomainEventType, PersistedDomainEvent } from "@/shared/events";

function canalLabel(tipo: string | null): string | null {
  if (!tipo) return null;
  return (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;
}

/** Empresa e canal são o contexto que toda mensagem de aviso precisa pra ser
 *  acionável — "estoque baixo" sozinho obriga a abrir o sistema pra
 *  descobrir de qual marca; "estoque baixo da KARZI" já é a mensagem
 *  inteira. Centralizado aqui (não em cada job que emite evento) porque o
 *  brandId e o canal já estão no evento ou a um único select de distância —
 *  não vale a pena espalhar essa resolução pelos ~10 pontos de emissão. */
async function enriquecerContexto(event: PersistedDomainEvent): Promise<{
  empresa: string | null;
  canal: string | null;
  produtoNome: string | null;
}> {
  // Import preguiçoso: um import estático de "@/shared/lib/db" arrasta o
  // driver `postgres` (net/tls/fs, só existe em Node) pro grafo de módulos.
  // despacharEvento (chamado por toda action "use server" que emite evento)
  // é alcançável de componentes "use client" — um import estático aqui
  // quebra o bundle do navegador mesmo esta função nunca rodando lá.
  const { db } = await import("@/shared/lib/db");
  const empresaPromise = event.brandId
    ? db.select({ nome: brand.name, slug: brand.slug }).from(brand).where(eq(brand.id, event.brandId)).then((rows) => rows[0])
    : Promise.resolve(undefined);

  let canalPromise: Promise<string | null> = Promise.resolve(null);
  if (event.entidade === "channel_account") {
    canalPromise = Promise.resolve(canalLabel((event.payload as { tipo?: string }).tipo ?? null));
  } else if (event.entidade === "pedido") {
    canalPromise = db.select({ canal: pedido.canal }).from(pedido).where(eq(pedido.id, event.entidadeId))
      .then((rows) => canalLabel(rows[0]?.canal ?? null));
  } else if (event.entidade === "conversa") {
    canalPromise = db.select({ tipo: channelAccount.tipo }).from(conversa)
      .innerJoin(channelAccount, eq(channelAccount.id, conversa.channelAccountId))
      .where(eq(conversa.id, event.entidadeId))
      .then((rows) => canalLabel(rows[0]?.tipo ?? null));
  }

  const produtoPromise = event.entidade === "produto"
    ? db.select({ nome: produto.nome }).from(produto).where(eq(produto.id, event.entidadeId)).then((rows) => rows[0]?.nome ?? null)
    : Promise.resolve(null);

  const [empresaRow, canal, produtoNome] = await Promise.all([empresaPromise, canalPromise, produtoPromise]);
  const empresa = empresaRow ? (getBrandConfig(empresaRow.slug)?.label ?? empresaRow.nome) : null;

  return { empresa, canal, produtoNome };
}

/**
 * Lista curada de eventos que viram aviso de WhatsApp para o responsável
 * que administra o CRM. Cobre hoje: Estoque, Atendimento, Vendas/Pós-venda,
 * Relacionamento (réguas) e Operacional/Conectores. IA (insight/sugestão)
 * fica fora de propósito —
 * são leituras, não avisos acionáveis.
 *
 * `score.churn_alterado` fica fora daqui apesar de existir: sem o nome do
 * cliente no payload hoje, a mensagem ficaria genérica demais para agir.
 * Reclamações do ML ainda não emitem evento de domínio — precisam de job
 * novo antes de entrar nesta lista.
 *
 * Cada mensagem sempre tenta dizer QUAL empresa e QUAL canal, e não só o quê
 * aconteceu — "some quando não existe" (backup é org-wide; estoque atravessa
 * canal por design, ver [[estoque-somente-canal]]) em vez de inventar.
 */
const FORMATADORES: Partial<Record<DomainEventType, (
  event: PersistedDomainEvent,
  contexto: { empresa: string | null; canal: string | null; produtoNome: string | null },
) => string>> = {
  "estoque.minimo_atingido": (e, { empresa, produtoNome }) => {
    const { sku, saldoAtual, minimo } = e.payload as { sku?: string; saldoAtual?: number; minimo?: number };
    return [
      "📦 *Estoque mínimo atingido*",
      empresa ? `Empresa: ${empresa}` : null,
      `Produto: ${produtoNome ?? "?"} (SKU ${sku ?? "?"})`,
      `Saldo atual: ${saldoAtual ?? "?"} · mínimo configurado: ${minimo ?? "?"}`,
      "Vale repor antes que o anúncio fique sem estoque em algum canal.",
    ].filter(Boolean).join("\n");
  },
  "estoque.parado_detectado": (e, { empresa, produtoNome }) => {
    const { sku, diasSemVenda, capitalParado } = e.payload as { sku?: string; diasSemVenda?: number; capitalParado?: number };
    return [
      "🐌 *Produto parado*",
      empresa ? `Empresa: ${empresa}` : null,
      `Produto: ${produtoNome ?? "?"} (SKU ${sku ?? "?"})`,
      `Sem venda há ${diasSemVenda ?? "?"} dias · capital parado: R$ ${capitalParado ?? "?"}`,
      "Pode ser hora de promoção, ajuste de preço ou revisão do anúncio.",
    ].filter(Boolean).join("\n");
  },
  "conversa.sem_resposta_24h": (e, { empresa, canal }) => {
    return [
      "💬 *Cliente esperando resposta*",
      empresa ? `Empresa: ${empresa}` : null,
      canal ? `Canal: ${canal}` : null,
      "Conversa aberta há mais de 24h sem retorno da equipe.",
    ].filter(Boolean).join("\n");
  },
  "canal.degradado": (e, { empresa, canal }) => {
    const { ultimoErro } = e.payload as { ultimoErro?: string };
    return [
      "⚠️ *Canal degradado*",
      empresa ? `Empresa: ${empresa}` : null,
      canal ? `Canal: ${canal}` : null,
      `Erro reportado: ${ultimoErro ?? "não informado"}`,
    ].filter(Boolean).join("\n");
  },
  "canal.desconectado": (e, { empresa, canal }) => {
    const { ultimoErro } = e.payload as { ultimoErro?: string };
    return [
      "🔴 *Canal desconectado*",
      empresa ? `Empresa: ${empresa}` : null,
      canal ? `Canal: ${canal}` : null,
      `Motivo: ${ultimoErro ?? "não informado"}`,
      "Reconecte em Configurações → Canais assim que possível.",
    ].filter(Boolean).join("\n");
  },
  "regua.falha_definitiva": (e, { empresa }) => {
    const { motivo } = e.payload as { motivo?: string };
    return [
      "🛑 *Régua travou de vez*",
      empresa ? `Empresa: ${empresa}` : null,
      `Motivo: ${motivo ?? "não informado"}`,
      "Essa régua não vai tentar de novo sozinha — vale olhar o cliente manualmente.",
    ].filter(Boolean).join("\n");
  },
  "importacao.com_erros": (e) => {
    const { aceitos, rejeitados, total } = e.payload as { aceitos?: number; rejeitados?: number; total?: number };
    return [
      "📥 *Importação concluída com erros*",
      `Aceitos: ${aceitos ?? "?"} de ${total ?? "?"}`,
      `Rejeitados: ${rejeitados ?? "?"}`,
      "Vale abrir o lote e ver o que não entrou.",
    ].filter(Boolean).join("\n");
  },
  "backup.falhou": (e) => {
    const { detalhe } = e.payload as { detalhe?: string };
    return [
      "🚨 *Verificação de backup falhou*",
      "Abrangência: toda a organização (este item não é por empresa/canal).",
      detalhe ? `Detalhe: ${detalhe}` : null,
    ].filter(Boolean).join("\n");
  },
  "pedido.cancelado": (e, { empresa, canal }) => {
    const { providerOrderId, total, canceladoMotivo } = e.payload as { providerOrderId?: string; total?: string; canceladoMotivo?: string };
    return [
      "❌ *Pedido cancelado*",
      empresa ? `Empresa: ${empresa}` : null,
      canal ? `Canal: ${canal}` : null,
      `Pedido: ${providerOrderId ?? e.entidadeId} · valor: R$ ${total ?? "?"}`,
      canceladoMotivo ? `Motivo: ${canceladoMotivo}` : null,
    ].filter(Boolean).join("\n");
  },
  "pedido.devolvido": (e, { empresa, canal }) => {
    const { providerOrderId, total } = e.payload as { providerOrderId?: string; total?: string };
    return [
      "↩️ *Pedido devolvido*",
      empresa ? `Empresa: ${empresa}` : null,
      canal ? `Canal: ${canal}` : null,
      `Pedido: ${providerOrderId ?? e.entidadeId} · valor: R$ ${total ?? "?"}`,
    ].filter(Boolean).join("\n");
  },
  // Só entra aqui a divergência que a conferência NÃO conseguiu resolver
  // sozinha (re-buscou na API e regravou, e mesmo assim a soma não fecha).
  // `emitirEventoUnico` já segura a repetição no ritmo do cron — aqui a
  // mensagem é o convite para alguém olhar caso a caso.
  "conferencia.divergencia_persistente": (e, { empresa, canal }) => {
    const { novas, totalPersistente, exemplos } = e.payload as {
      novas?: number; totalPersistente?: number; exemplos?: string[];
    };
    return [
      "🧮 *Conferência financeira travou*",
      empresa ? `Empresa: ${empresa}` : null,
      canal ? `Canal: ${canal}` : null,
      `${novas ?? "?"} pedido(s) novo(s) sem fechar a soma dos elementos com o bruto — ${totalPersistente ?? "?"} no total.`,
      exemplos?.length ? `Ex.: ${exemplos.slice(0, 5).join(", ")}` : null,
      "A API já foi re-consultada e o resíduo continua. Abra Admin → Conferência financeira.",
    ].filter(Boolean).join("\n");
  },
};

export function whatsappAlertaConfigurado(): boolean {
  return process.env.WHATSAPP_ADMIN_ALERTAS_ENABLED === "true"
    && zapiConfigurado()
    && Boolean(process.env.WHATSAPP_ADMIN_NUMERO);
}

/**
 * Ponto único de saída para avisos de WhatsApp. Chamado pelo despachante
 * central de eventos (despacharEvento) — nunca deve lançar, uma falha aqui
 * não pode derrubar a operação de negócio que gerou o evento.
 */
export async function notificarAdminWhatsApp(event: PersistedDomainEvent): Promise<void> {
  if (!whatsappAlertaConfigurado()) return;

  const formatar = FORMATADORES[event.tipo];
  if (!formatar) return;

  try {
    const contexto = await enriquecerContexto(event);
    await enviarTextoZApi({
      numero: process.env.WHATSAPP_ADMIN_NUMERO!,
      mensagem: formatar(event, contexto),
    });
  } catch (error) {
    console.error(`[notificarAdminWhatsApp] falha ao enviar aviso para ${event.tipo} (${event.eventId}):`, error);
  }
}
