import type { MessagingProvider, MensagemPayload, SaudeConector } from "../domain/ports";
import { brandEnvSuffix, type BrandSlug } from "@/shared/config/brands";

export class ZApiProvider implements MessagingProvider {
  private instanceId: string;
  private token: string;
  private baseUrl = "https://api.z-api.io";

  constructor(instanceId: string, token: string) {
    this.instanceId = instanceId;
    this.token = token;
  }

  async enviarMensagem(payload: MensagemPayload): Promise<{ providerMessageId: string }> {
    const url = `${this.baseUrl}/instances/${this.instanceId}/token/${this.token}/send-text`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: payload.para, message: payload.conteudo }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Z-API erro ${res.status}: ${err}`);
    }

    const data = await res.json() as { zaapId?: string; messageId?: string };
    return { providerMessageId: data.zaapId ?? data.messageId ?? "" };
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      const url = `${this.baseUrl}/instances/${this.instanceId}/token/${this.token}/status`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const latenciaMs = Date.now() - inicio;

      if (!res.ok) return { status: "degradado", latenciaMs, mensagem: `HTTP ${res.status}`, verificadoEm: new Date() };

      const data = await res.json() as { connected?: boolean };
      return {
        status: data.connected ? "ok" : "degradado",
        latenciaMs,
        mensagem: data.connected ? "Conectado" : "Instância desconectada",
        verificadoEm: new Date(),
      };
    } catch (err) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(err), verificadoEm: new Date() };
    }
  }
}

export function criarZApiProvider(brandSlug: BrandSlug): ZApiProvider {
  const upper = brandEnvSuffix(brandSlug);
  const instanceId = process.env[`ZAPI_INSTANCE_${upper}`];
  const token = process.env[`ZAPI_TOKEN_${upper}`];

  if (!instanceId || !token) {
    throw new Error(`Credenciais Z-API não configuradas para ${upper}. Verifique as variáveis de ambiente.`);
  }

  return new ZApiProvider(instanceId, token);
}
