import { createHmac } from "crypto";

/**
 * Valida o header x-signature enviado pelo Mercado Livre.
 * Formato: "ts=<timestamp>,v1=<hmac-sha256>"
 * Payload assinado: "x-request-id:<requestId>;request-id:<requestId>;ts:<timestamp>"
 *
 * Docs: https://developers.mercadolivre.com.br/pt_br/notificacoes-de-pedidos
 */
export function validarAssinaturaML(
  xSignature: string | null,
  xRequestId: string | null,
  secret: string,
): boolean {
  if (!xSignature || !xRequestId) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => p.split("=") as [string, string])
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const payload = `x-request-id:${xRequestId};request-id:${xRequestId};ts:${ts}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  // Comparação em tempo constante para evitar timing attacks
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}
