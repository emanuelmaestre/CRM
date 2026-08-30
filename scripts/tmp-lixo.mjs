import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const orgId = process.env.DEFAULT_ORG_ID;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: marcas } = await sb.from("brand").select("id, slug, name, criado_em").eq("org_id", orgId);
const testes = marcas.filter((m) => /^teste_/i.test(m.slug));
console.log("marcas reais:", marcas.filter((m) => !/^teste_/i.test(m.slug)).map((m) => m.slug));
for (const m of testes) {
  console.log(`\n--- ${m.slug} (${m.name}) id=${m.id} criada=${m.criado_em ?? "?"}`);
  for (const tabela of ["channel_account", "pedido", "produto", "pedido_ignorado", "evento_dominio", "audit_log", "sincronizacao_execucao"]) {
    const { count, error } = await sb.from(tabela).select("id", { count: "exact", head: true }).eq("brand_id", m.id);
    if (error) { console.log(`    ${tabela}: (sem brand_id?) ${error.message.slice(0, 60)}`); continue; }
    if (count) console.log(`    ${tabela}: ${count}`);
  }
}
