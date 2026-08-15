import { cookies } from "next/headers";
import { requirePageRoute } from "@/shared/lib/auth/session";
import { CLIENTES_PIN_COOKIE, verificarCookiePin } from "@/shared/lib/auth/clientes-pin";
import { ClientesPinGate } from "./pin-gate";

export default async function ClientesLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/clientes");

  const store = await cookies();
  const autorizado = verificarCookiePin(store.get(CLIENTES_PIN_COOKIE)?.value);

  if (!autorizado) return <ClientesPinGate />;

  return children;
}
