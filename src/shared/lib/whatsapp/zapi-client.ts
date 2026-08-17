/**
 * Cliente mínimo da Z-API para envio de texto simples via WhatsApp.
 * Referência: https://developer.z-api.io/message/send-message-text
 */

interface EnviarTextoInput {
  numero: string;
  mensagem: string;
}

export function zapiConfigurado(): boolean {
  return Boolean(process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_TOKEN && process.env.ZAPI_CLIENT_TOKEN);
}

export async function enviarTextoZApi({ numero, mensagem }: EnviarTextoInput): Promise<void> {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !token || !clientToken) {
    throw new Error("Z-API não configurada (ZAPI_INSTANCE_ID / ZAPI_TOKEN / ZAPI_CLIENT_TOKEN ausentes).");
  }

  const resposta = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken,
    },
    body: JSON.stringify({ phone: numero, message: mensagem }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Z-API respondeu ${resposta.status} ao enviar mensagem: ${corpo}`);
  }
}
