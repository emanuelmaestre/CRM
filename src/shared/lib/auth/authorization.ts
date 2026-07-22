import permissionsConfig from "@/config/permissions.json";

export const PERFIS = ["admin", "gestor", "vendedor"] as const;
export type Perfil = (typeof PERFIS)[number];

export function isPerfil(value: unknown): value is Perfil {
  return typeof value === "string" && PERFIS.includes(value as Perfil);
}

export function perfilPodeAcessar(perfil: Perfil, pathname: string): boolean {
  const regra = permissionsConfig.routes.find(({ prefix }) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return !regra || regra.profiles.includes(perfil);
}

export function perfilPermitido(perfil: Perfil, permitidos: readonly Perfil[]): boolean {
  return permitidos.includes(perfil);
}

export function nomePerfil(perfil: Perfil): string {
  return permissionsConfig.profiles[perfil].label;
}
