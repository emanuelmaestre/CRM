import { processarNotificacaoPedidoMercadoLivre } from "@/modules/canais/application/processar-notificacao-ml.service";
import type { NotificacaoPedidoMercadoLivre } from "@/modules/canais/application/processar-notificacao-ml.service";
import { inngest } from "@/shared/lib/inngest/client";

export const A38_processarWebhookML = inngest.createFunction(
  {
    id: "A38-processar-webhook-ml",
    name: "A38 — Processar notificação de pedido do Mercado Livre",
    retries: 5,
    idempotency: "event.data.notificationId",
    triggers: [{ event: "canal/mercadolivre.pedido-notificado" }],
  },
  async ({ event, step }) => {
    const notificacao = event.data as NotificacaoPedidoMercadoLivre;
    return step.run(`processar-pedido-${notificacao.orderId}`, () =>
      processarNotificacaoPedidoMercadoLivre(notificacao),
    );
  },
);
