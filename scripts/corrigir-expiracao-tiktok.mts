/**
 * Reescreve `canal_tokens.expires_at` das lojas TikTok a partir do prazo real
 * que o próprio TikTok devolveu e que ficou guardado em `raw`.
 *
 * Existe por um erro de leitura: `access_token_expire_in` tem nome de duração
 * mas é o INSTANTE de expiração em epoch de segundos. O callback somava esse
 * número a `Date.now()`, então as três marcas ficaram com validade no ano 2083
 * — o token morre em 7 dias e nada no banco jamais diz que venceu, de modo que
 * a renovação do A36 nunca acharia o que renovar. O callback já foi corrigido
 * (ver `expiracaoTikTokISO`); isto conserta as linhas gravadas antes disso.
 *
 * De uso único: depois de rodar, toda linha nova já nasce com o prazo certo.
 *
 *   node --import tsx --import ./scripts/register-server-only.mjs \
 *        --env-file=.env --env-file=.env.local \
 *        scripts/corrigir-expiracao-tiktok.mts [--aplicar]
 *
 * Sem `--aplicar` só mostra o que mudaria.
 */
import { createClient } from "@supabase/supabase-js";
import { expiracaoTikTokISO } from "../src/modules/canais/application/tiktok-token.service";

const aplicar = process.argv.includes("--aplicar");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.");
const sb = createClient(url, chave);

const { data: marcas } = await sb.from("brand").select("id, slug");
const { data: linhas, error } = await sb
  .from("canal_tokens")
  .select("id, brand_id, expires_at, raw")
  .eq("canal", "tiktokshop");
if (error) throw new Error(`Leitura de canal_tokens falhou: ${error.message}`);

for (const linha of (linhas ?? []) as Array<{ id: string; brand_id: string; expires_at: string | null; raw: Record<string, unknown> | null }>) {
  const slug = (marcas as Array<{ id: string; slug: string }> | null)?.find((m) => m.id === linha.brand_id)?.slug ?? linha.brand_id;
  const prazo = linha.raw?.access_token_expire_in;
  if (typeof prazo !== "number" || prazo <= 0) {
    console.log(`${slug}: sem access_token_expire_in em raw — nada a fazer.`);
    continue;
  }
  const corrigido = expiracaoTikTokISO(prazo);
  console.log(`${slug}: ${linha.expires_at} -> ${corrigido}`);
  if (!aplicar) continue;
  const { error: falha } = await sb.from("canal_tokens").update({ expires_at: corrigido }).eq("id", linha.id);
  console.log(falha ? `  FALHOU: ${falha.message}` : "  gravado");
}

if (!aplicar) console.log("\nSimulação. Repita com --aplicar para gravar.");
