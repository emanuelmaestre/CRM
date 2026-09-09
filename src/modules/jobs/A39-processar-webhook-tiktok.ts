import { processarNotificacaoPedidoTikTok } from "@/modules/canais/application/processar-notificacao-tiktok.service";
import { inngest } from "@/shared/lib/inngest/client";

export const A39_processarWebhookTikTok = inngest.createFunction(
  {
    id: "A39-processar-webhook-tiktok",
    name: "A39: Atualizar pedido e pós-venda TikTok",
    retries: 5,
    idempotency: "event.data.notificationId",
    triggers: [{ event: "canal/tiktok.pedido-notificado" }],
  },
  async ({ event, step }) => {
    const { shopId, orderId, type } = event.data as { shopId: string; orderId: string; type: number };
    return step.run(`pedido-${orderId}`, () => processarNotificacaoPedidoTikTok(shopId, orderId, type));
  },
);
