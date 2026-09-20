import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

/**
 * Cliente com service role criado sob demanda. Instanciar no topo do módulo
 * quebra o build quando as variáveis ainda não existem no ambiente.
 */
export function clienteServico(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return cliente;
}

/** Proxy preguiçoso: só cria o cliente no primeiro acesso a uma propriedade. */
export const supabaseServico = new Proxy({} as SupabaseClient, {
  get(_alvo, prop, receptor) {
    return Reflect.get(clienteServico(), prop, receptor);
  },
});
