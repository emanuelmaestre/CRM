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
const limiterConfig = {
  // Webhooks: marketplaces podem enviar rajadas; limite generoso por IP
  webhook: [200, "1 m"],
  // Rotas de autenticação: proteção contra força bruta
  auth: [10, "1 m"],
  // Rota de provisão (admin): praticamente um one-shot
  provision: [5, "1 h"],
} as const satisfies Record<string, readonly [
  number,
  Parameters<typeof Ratelimit.slidingWindow>[1],
]>;

type LimiterType = keyof typeof limiterConfig;
const limiterCache = new Map<LimiterType, Ratelimit | null>();

function getLimiter(tipo: LimiterType): Ratelimit | null {
  if (!limiterCache.has(tipo)) {
    const [requests, window] = limiterConfig[tipo];
    limiterCache.set(tipo, makeLimiter(requests, window));
  }
  return limiterCache.get(tipo) ?? null;
}

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
  const limiter = getLimiter(tipo);
  if (!limiter) return null; // no-op sem Upstash

  const id = getIdentifier(req);
  const { success, limit, reset } = await limiter.limit(id);

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
