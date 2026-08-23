"use server";

import { cookies, headers } from "next/headers";
import {
  CLIENTES_PIN_COOKIE,
  getClientesPinHash,
  isPinFormatValid,
  verificarPin,
} from "@/shared/lib/auth/clientes-pin";

export async function verificarPinClientes(
  pin: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!isPinFormatValid(pin)) {
    return { ok: false, erro: "Informe os 6 dígitos do PIN." };
  }

  if (!verificarPin(pin)) {
    return { ok: false, erro: "PIN incorreto." };
  }

  // NODE_ENV=production não implica HTTPS: o CI serve o build de produção
  // sobre localhost puro, e um cookie Secure ali é descartado em silêncio
  // pelo navegador (o PIN nunca "gruda" — sem erro, só o gate voltando
  // sempre). x-forwarded-proto é o que o proxy real (Vercel/etc.) manda.
  const requestHeaders = await headers();
  const https = requestHeaders.get("x-forwarded-proto") === "https";

  const store = await cookies();
  store.set(CLIENTES_PIN_COOKIE, getClientesPinHash(), {
    httpOnly: true,
    secure: https,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return { ok: true };
}
