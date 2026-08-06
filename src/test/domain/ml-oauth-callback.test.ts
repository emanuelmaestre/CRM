import { NextRequest } from "next/server";
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
    const passthrough = ["select", "eq", "update", "insert", "upsert", "delete"];
    for (const method of passthrough) {
      obj[method] = vi.fn(() => obj);
    }
    obj.maybeSingle = vi.fn(() => resolver());
    obj.single = vi.fn(() => resolver());
    function resolver(): Promise<SupabaseResult> {
      const queue = supabaseResults.queues[table] ?? [];
      const value = queue.length > 1 ? queue.shift()! : queue[0];
      return Promise.resolve(value ?? { data: null, error: null });
    }
    // upsert()/insert()/delete() chains that are awaited directly (no .single()/.maybeSingle())
    (obj as { then?: unknown }).then = (resolve: (v: SupabaseResult) => unknown, reject?: (e: unknown) => unknown) =>
      resolver().then(resolve, reject);
    return obj;
  }
  return {
    createClient: vi.fn(() => ({
      from: vi.fn((table: string) => chain(table)),
    })),
  };
});

const { GET } = await import("@/app/api/ml/callback/route");

const APP_URL = "https://app.exemplo.com.br";
const BRAND_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function montarRequest(opts: {
  code?: string;
  state?: string;
  error?: string;
  cookieState?: string;
  cookieVerifier?: string;
}) {
  const params = new URLSearchParams();
  if (opts.code) params.set("code", opts.code);
  if (opts.state) params.set("state", opts.state);
  if (opts.error) params.set("error", opts.error);

  const cookies: string[] = [];
  if (opts.cookieState) cookies.push(`ml_pkce_state=${opts.cookieState}`);
  if (opts.cookieVerifier) cookies.push(`ml_pkce_verifier=${opts.cookieVerifier}`);

  return new NextRequest(`http://localhost/api/ml/callback?${params}`, {
    headers: cookies.length ? { cookie: cookies.join("; ") } : undefined,
  });
}

describe("callback OAuth Mercado Livre", () => {
  let originalEnv: Record<string, string | undefined>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalEnv = {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      ML_CLIENT_ID: process.env.ML_CLIENT_ID,
      ML_CLIENT_SECRET: process.env.ML_CLIENT_SECRET,
      DEFAULT_ORG_ID: process.env.DEFAULT_ORG_ID,
      ML_SELLER_ID_KARZI: process.env.ML_SELLER_ID_KARZI,
    };
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;
    process.env.ML_CLIENT_ID = "client-id-teste";
    process.env.ML_CLIENT_SECRET = "client-secret-teste";
    process.env.DEFAULT_ORG_ID = ORG_ID;
    originalFetch = global.fetch;
    configurarSupabase({});
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("redireciona com erro quando o Mercado Livre retorna ?error=", async () => {
    const req = montarRequest({ error: "access_denied" });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${APP_URL}/configuracoes?ml_error=access_denied`);
  });

  it("redireciona com missing_params quando faltam code ou state", async () => {
    const req = montarRequest({ code: "abc" });
    const res = await GET(req);
    expect(res.headers.get("location")).toBe(`${APP_URL}/configuracoes?ml_error=missing_params`);
  });

  it("redireciona com state_mismatch quando o cookie não bate com o state", async () => {
    const req = montarRequest({
      code: "abc",
      state: "karzi:xyz",
      cookieState: "karzi:outro",
      cookieVerifier: "verifier-1",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toBe(`${APP_URL}/configuracoes?ml_error=state_mismatch`);
  });

  it("redireciona com state_mismatch quando falta o cookie verifier", async () => {
    const req = montarRequest({
      code: "abc",
      state: "karzi:xyz",
      cookieState: "karzi:xyz",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toBe(`${APP_URL}/configuracoes?ml_error=state_mismatch`);
  });

  it("redireciona com invalid_brand quando o prefixo do state não é uma marca válida", async () => {
    const req = montarRequest({
      code: "abc",
      state: "marca-invalida:xyz",
      cookieState: "marca-invalida:xyz",
      cookieVerifier: "verifier-1",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toBe(`${APP_URL}/configuracoes?ml_error=invalid_brand`);
  });

  it("redireciona com token_exchange_failed quando a troca de code falha", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    }) as unknown as typeof fetch;

    const req = montarRequest({
      code: "abc",
      state: "karzi:xyz",
      cookieState: "karzi:xyz",
      cookieVerifier: "verifier-1",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("ml_error=token_exchange_failed");
  });

  it("recusa quando o seller autorizado não bate com o seller esperado da marca", async () => {
    process.env.ML_SELLER_ID_KARZI = "seller-esperado";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "token-abc",
        token_type: "bearer",
        expires_in: 21600,
        scope: "offline_access read write",
        user_id: 999999,
        refresh_token: "refresh-abc",
      }),
    }) as unknown as typeof fetch;

    const req = montarRequest({
      code: "abc",
      state: "karzi:xyz",
      cookieState: "karzi:xyz",
      cookieVerifier: "verifier-1",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("ml_error=conta_incorreta");
  });

  it("conecta com sucesso: grava token, sincroniza channel_account e redireciona ml_connected", async () => {
    process.env.ML_SELLER_ID_KARZI = "555";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "token-abc",
        token_type: "bearer",
        expires_in: 21600,
        scope: "offline_access read write",
        user_id: 555,
        refresh_token: "refresh-abc",
      }),
    }) as unknown as typeof fetch;

    configurarSupabase({
      brand: [{ data: { id: BRAND_ID }, error: null }],
      canal_tokens: [{ error: null }],
      channel_account: [
        { data: null, error: null }, // select existente -> não encontrado
        { data: { id: "conta-1" }, error: null }, // insert().select().single()
      ],
      audit_log: [{ error: null }],
    });

    const req = montarRequest({
      code: "abc",
      state: "karzi:xyz",
      cookieState: "karzi:xyz",
      cookieVerifier: "verifier-1",
    });
    const res = await GET(req);

    expect(res.headers.get("location")).toBe(`${APP_URL}/configuracoes?ml_connected=karzi`);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/ml_pkce_verifier=;/);
  });

  it("redireciona com invalid_brand quando a marca não é encontrada no banco", async () => {
    process.env.ML_SELLER_ID_KARZI = "555";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "token-abc",
        token_type: "bearer",
        expires_in: 21600,
        scope: "offline_access read write",
        user_id: 555,
        refresh_token: "refresh-abc",
      }),
    }) as unknown as typeof fetch;

    configurarSupabase({
      brand: [{ data: null, error: null }],
    });

    const req = montarRequest({
      code: "abc",
      state: "karzi:xyz",
      cookieState: "karzi:xyz",
      cookieVerifier: "verifier-1",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toBe(`${APP_URL}/configuracoes?ml_error=invalid_brand`);
  });

  it("redireciona com db_failed e não deixa token órfão quando a sincronização de channel_account falha", async () => {
    process.env.ML_SELLER_ID_KARZI = "555";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "token-abc",
        token_type: "bearer",
        expires_in: 21600,
        scope: "offline_access read write",
        user_id: 555,
        refresh_token: "refresh-abc",
      }),
    }) as unknown as typeof fetch;

    configurarSupabase({
      brand: [{ data: { id: BRAND_ID }, error: null }],
      canal_tokens: [{ error: null }, { error: null }], // upsert ok, depois delete de limpeza
      channel_account: [
        { data: null, error: null }, // select existente
        { data: null, error: { message: "falha ao inserir" } }, // insert falha
      ],
    });

    const req = montarRequest({
      code: "abc",
      state: "karzi:xyz",
      cookieState: "karzi:xyz",
      cookieVerifier: "verifier-1",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toBe(`${APP_URL}/configuracoes?ml_error=db_failed`);
  });
});
