import type { NextConfig } from "next";

/* Aviso de build. As NEXT_PUBLIC_* são substituídas por literais aqui, no
   build — se chegarem vazias, o app sobe quebrado e só descobrimos em
   produção. Imprime apenas NOMES, nunca valores, e apenas no log de build,
   que é privado. Não derruba o build: só torna visível o que antes era mudo. */
const ENV_ESPERADAS_NO_BUILD = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "DEFAULT_ORG_ID",
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const ausentesNoBuild = ENV_ESPERADAS_NO_BUILD.filter(
  (nome) => !process.env[nome]?.trim(),
);

console.log(
  `[build] variáveis visíveis no ambiente: ${Object.keys(process.env).length}` +
    ` | VERCEL_ENV=${process.env.VERCEL_ENV ?? "(ausente)"}` +
    ` | esperadas ausentes: ${ausentesNoBuild.length ? ausentesNoBuild.join(", ") : "nenhuma"}`,
);

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js inline scripts + Supabase realtime
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Supabase storage images
      "img-src 'self' data: blob: https://*.supabase.co",
      // Supabase API, Inngest, Z-API, OpenAI, Upstash
      [
        "connect-src 'self'",
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://api.inngest.com",
        "https://inn.gs",
        "https://api.z-api.io",
        "https://api.openai.com",
        "https://*.upstash.io",
      ].join(" "),
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/anuncios/:path*",
        destination: "/publicidade/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/publicidade/:path*",
        destination: "/anuncios/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
