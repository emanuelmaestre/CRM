import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

// Instância única do Redis — undefined quando as env vars não estão configuradas
// (ambiente de dev sem Upstash). Nesse caso o rate limiting é no-op.
function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function makeLimiter(requests: number, window: Parameters<typeof Ratelimit.slidingWindow>[1]) {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: true,
    prefix: "crm_leo",
  });
}

// Limites por tipo de rota (configurados conforme PRD §12.1)
const limiters = {
  // Webhooks: marketplaces podem enviar rajadas; limite generoso por IP
  webhook: makeLimiter(200, "1 m"),
  // Rotas de autenticação: proteção contra força bruta
  auth: makeLimiter(10, "1 m"),
  // Rota de provisão (admin): praticamente um one-shot
  provision: makeLimiter(5, "1 h"),
} as const;

type LimiterType = keyof typeof limiters;

function getIdentifier(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Verifica o rate limit para a rota e retorna uma resposta 429 se excedido.
 * Retorna `null` se a requisição pode prosseguir.
 *
 * Uso no início de qualquer route handler:
 * ```ts
 * const bloqueio = await verificarRateLimit(req, "webhook");
 * if (bloqueio) return bloqueio;
 * ```
 */
export async function verificarRateLimit(
  req: NextRequest,
  tipo: LimiterType,
): Promise<NextResponse | null> {
  const limiter = limiters[tipo];
  if (!limiter) return null; // no-op sem Upstash

  const id = getIdentifier(req);
  const { success, limit, remaining, reset } = await limiter.limit(id);

  if (!success) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(reset),
          "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
        },
      },
    );
  }

  return null;
}
