import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { destinoSeguroPosLogin } from "@/shared/lib/auth/destino-pos-login";

const PUBLIC_PATHS = new Set([
  "/",
  "/auth/login",
  "/auth/acesso-negado",
  "/termos",
  "/privacidade",
  "/terms",
  "/privacy",
  "/seguranca",
  "/security",
]);
const PUBLIC_API_PREFIXES = [
  "/api/inngest",
  "/api/provision",
  "/api/tiktok-verify",
  "/api/webhooks",
  "/api/ml/callback",
];

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublicApi(pathname)) return NextResponse.next({ request });

  /* Sem estas duas, createServerClient lançava e o proxy derrubava TODAS as
     rotas com um 500 vazio — sem log útil, sem dizer o que faltava. O sintoma
     era indistinguível de um bug de código. Falha explícita e fechada: nega o
     acesso e nomeia a variável ausente, sem revelar nenhum valor.
     São NEXT_PUBLIC_*, ou seja, embutidas em tempo de build: se faltarem aqui,
     faltavam no build, não no runtime. */
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    const ausentes = [
      supabaseUrl ? null : "NEXT_PUBLIC_SUPABASE_URL",
      supabaseAnonKey ? null : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ].filter(Boolean);
    console.error(
      `[proxy] configuração ausente no build: ${ausentes.join(", ")}`,
    );
    return NextResponse.json(
      {
        error: "Aplicação sem configuração.",
        ausentes,
        envNoBuild: process.env.BUILD_ENV_COUNT ?? "?",
        faltaramNoBuild: process.env.BUILD_ENV_FALTANTES ?? "?",
      },
      { status: 503 },
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims valida a assinatura do JWT pelo JWKS (com cache) e evita uma
  // chamada ao Auth server em cada navegação. O proxy continua responsável
  // por renovar a sessão expirada e propagar os cookies atualizados.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims.sub);

  const isLoginRoute = pathname === "/auth/login";
  const isPublicRoute = PUBLIC_PATHS.has(pathname);
  const isApiRoute = pathname.startsWith("/api/");

  if (!isAuthenticated && !isPublicRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    /* O destino leva a query junto, e a URL do login vai limpa.
       `clone()` traz a query da rota barrada, então `/estoque?filtro=parados`
       virava `/auth/login?filtro=parados&next=/estoque`: os parâmetros
       vazavam para o login e o destino voltava sem o recorte. */
    const destino = `${pathname}${request.nextUrl.search}`;
    url.pathname = "/auth/login";
    url.search = "";
    url.searchParams.set("next", destino);
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (isAuthenticated && isLoginRoute) {
    /* Quem já tem sessão e cai no login ainda carrega o `next` que o proxy
       escreveu — sessão renovada em outra aba, ou um F5 na tela de login. Sem
       honrar o destino aqui, o recorte do link se perdia mesmo com a pessoa
       logada, que é justamente o caso que esta correção existe para resolver. */
    const url = new URL(
      destinoSeguroPosLogin(request.nextUrl.searchParams.get("next")),
      request.nextUrl.origin,
    );
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}
