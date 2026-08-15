import "server-only";

import { createHash } from "node:crypto";

export const CLIENTES_PIN_COOKIE = "clientes_pin_ok";
const PIN_REGEX = /^\d{6}$/;

function getConfiguredPin(): string {
  const pin = process.env.CLIENTES_PIN;
  if (!pin || !PIN_REGEX.test(pin)) {
    throw new Error("CLIENTES_PIN não configurado ou inválido (esperado 6 dígitos).");
  }
  return pin;
}

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

export function getClientesPinHash(): string {
  return hashPin(getConfiguredPin());
}

export function isPinFormatValid(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export function verificarPin(pin: string): boolean {
  return isPinFormatValid(pin) && pin === getConfiguredPin();
}

export function verificarCookiePin(cookieValue: string | undefined): boolean {
  return Boolean(cookieValue) && cookieValue === getClientesPinHash();
}
