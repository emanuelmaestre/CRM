import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SupabaseResult = { data?: unknown; error?: unknown };

const supabaseResults = vi.hoisted(() => ({
  queues: {} as Record<string, SupabaseResult[]>,
}));

function configurarSupabase(results: Record<string, SupabaseResult[]>) {
  supabaseResults.queues = results;
}

vi.mock("@supabase/supabase-js", () => {
  function chain(table: string) {
    const obj: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) {
      obj[method] = vi.fn(() => obj);
    }
    obj.maybeSingle = vi.fn(() => {
      const queue = supabaseResults.queues[table] ?? [];
      const value = queue.length > 1 ? queue.shift()! : queue[0];
      return Promise.resolve(value ?? { data: null, error: null });
    });
    return obj;
  }
  return {
    createClient: vi.fn(() => ({ from: vi.fn((table: string) => chain(table)) })),
  };
});

const { obterTokenMercadoLivre } = await import("@/modules/canais/infrastructure/mercadolivre.provider");

describe("obterTokenMercadoLivre — fallback estático de ambiente", () => {
  let originalEnv: Record<string, string | undefined>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = {
      DEFAULT_ORG_ID: process.env.DEFAULT_ORG_ID,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      ML_ACCESS_TOKEN_KARZI: process.env.ML_ACCESS_TOKEN_KARZI,
      ML_REFRESH_TOKEN_KARZI: process.env.ML_REFRESH_TOKEN_KARZI,
    };
    process.env.DEFAULT_ORG_ID = "22222222-2222-4222-8222-222222222222";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-servico";
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    configurarSupabase({});
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    warnSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("avisa quando não há token persistido em canal_tokens e usa o fallback do .env", async () => {
    process.env.ML_ACCESS_TOKEN_KARZI = "token-env-karzi";
    process.env.ML_REFRESH_TOKEN_KARZI = "refresh-env-karzi";
    configurarSupabase({
      brand: [{ data: { id: "brand-1" }, error: null }],
      canal_tokens: [{ data: null, error: null }],
    });

    const resultado = await obterTokenMercadoLivre("karzi");

    expect(resultado).toEqual({ accessToken: "token-env-karzi", refreshToken: "refresh-env-karzi" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("nenhum token persistido em canal_tokens");
  });

  it("avisa quando o token do banco está expirado e cai para o fallback do .env", async () => {
    process.env.ML_ACCESS_TOKEN_KARZI = "token-env-karzi";
    configurarSupabase({
      brand: [{ data: { id: "brand-1" }, error: null }],
      canal_tokens: [{
        data: {
          access_token: "token-banco-expirado",
          refresh_token: "refresh-banco",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
        error: null,
      }],
    });

    const resultado = await obterTokenMercadoLivre("karzi");

    expect(resultado.accessToken).toBe("token-env-karzi");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("token OAuth em canal_tokens expirado");
  });

  it("não avisa quando o token do banco está válido", async () => {
    configurarSupabase({
      brand: [{ data: { id: "brand-1" }, error: null }],
      canal_tokens: [{
        data: {
          access_token: "token-banco-valido",
          refresh_token: "refresh-banco",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
        error: null,
      }],
    });

    const resultado = await obterTokenMercadoLivre("karzi");

    expect(resultado.accessToken).toBe("token-banco-valido");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("lança erro claro quando não há token em nenhuma fonte", async () => {
    configurarSupabase({
      brand: [{ data: { id: "brand-1" }, error: null }],
      canal_tokens: [{ data: null, error: null }],
    });
    delete process.env.ML_ACCESS_TOKEN_KARZI;

    await expect(obterTokenMercadoLivre("karzi")).rejects.toThrow(/Credencial Mercado Livre indisponível/);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
