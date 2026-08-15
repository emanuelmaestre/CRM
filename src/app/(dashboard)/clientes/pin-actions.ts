"use server";

import { cookies } from "next/headers";
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

  const store = await cookies();
  store.set(CLIENTES_PIN_COOKIE, getClientesPinHash(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return { ok: true };
}
