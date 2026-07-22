import { inngest } from "@/shared/lib/inngest/client";
import { createClient } from "@supabase/supabase-js";

const MARGEM_MS = 30 * 60 * 1000; // renova se expira em menos de 30 min

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function refreshToken(row: {
  id: string;
  refresh_token: string;
}): Promise<void> {
  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      refresh_token: row.refresh_token,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ML refresh falhou (${res.status}): ${body}`);
  }

  const tokens = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    user_id: number;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error } = await supabase()
    .from("canal_tokens")
    .update({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token ?? row.refresh_token,
      expires_at:    expiresAt,
      scope:         tokens.scope,
      raw:           tokens as unknown as Record<string, unknown>,
    })
    .eq("id", row.id);

  if (error) throw new Error(`DB update falhou: ${error.message}`);
}

export const A23_refreshMLTokens = inngest.createFunction(
  {
    id:   "A23-refresh-ml-tokens",
    name: "A23 — Renovar tokens OAuth do Mercado Livre",
    triggers: [{ cron: "0 */5 * * *" }], // a cada 5 horas
  },
  async ({ step, logger }) => {
    const vencemEm = new Date(Date.now() + MARGEM_MS).toISOString();

    const rows = await step.run("buscar-tokens-proximos", async () => {
      const { data, error } = await supabase()
        .from("canal_tokens")
        .select("id, refresh_token, expires_at, brand_id")
        .eq("canal", "mercadolivre")
        .not("refresh_token", "is", null)
        .lt("expires_at", vencemEm);
      if (error) throw new Error(`Erro ao buscar tokens: ${error.message}`);
      return (data ?? []) as { id: string; refresh_token: string }[];
    });
    if (!rows?.length) {
      logger.info("Nenhum token ML próximo de expirar.");
      return { renovados: 0 };
    }

    let renovados = 0;
    for (const row of rows) {
      await step.run(`renovar-token-${row.id}`, async () => {
        await refreshToken(row as { id: string; refresh_token: string });
        renovados++;
      });
    }

    logger.info(`Tokens ML renovados: ${renovados}`);
    return { renovados };
  },
);
