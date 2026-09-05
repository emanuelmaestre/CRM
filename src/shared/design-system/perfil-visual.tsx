import { Briefcase, Handshake, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Perfil } from "@/shared/lib/auth/authorization";

/** Ícone e cor de cada perfil, num lugar só.
 *
 *  Todo mundo aparecia igual na tela: o mesmo círculo roxo com as iniciais,
 *  em cima e na lista de usuários. Numa organização com três perfis de acesso
 *  bem diferentes — quem administra, quem opera e quem vende — descobrir o
 *  que uma pessoa pode fazer exigia ler o rótulo de cargo, letra a letra, em
 *  cada linha.
 *
 *  A cor e o ícone dão isso de relance. Escudo é permissão, pasta é operação,
 *  aperto de mão é venda; e nenhuma das três cores é vermelha ou âmbar, que
 *  neste sistema já significam problema com dinheiro. */
const VISUAIS: Record<Perfil, { Icone: LucideIcon; cor: string }> = {
  admin: { Icone: ShieldCheck, cor: "var(--primary)" },
  gestor: { Icone: Briefcase, cor: "var(--info)" },
  vendedor: { Icone: Handshake, cor: "var(--success)" },
};

export function visualDoPerfil(perfil: Perfil) {
  return VISUAIS[perfil] ?? VISUAIS.admin;
}

/** Avatar com as iniciais na cor do perfil e o ícone do perfil num selo.
 *
 *  As iniciais continuam sendo o identificador — num time com três gestores,
 *  o ícone sozinho não diz qual deles é. O selo é a camada de cima: diz o
 *  papel sem tirar o nome do lugar. */
export function PerfilAvatar({ perfil, iniciais, tamanho = 24, apagado = false, className = "" }: {
  perfil: Perfil;
  iniciais: string;
  /** Diâmetro do círculo em px. O selo acompanha proporcionalmente. */
  tamanho?: number;
  /** Usuário pausado: o perfil continua legível, mas sem chamar atenção. */
  apagado?: boolean;
  className?: string;
}) {
  const { Icone, cor } = visualDoPerfil(perfil);
  const corAtual = apagado ? "var(--muted-foreground)" : cor;
  const selo = Math.round(tamanho * 0.46);

  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: tamanho, height: tamanho }}>
      <span
        className="inline-flex items-center justify-center rounded-full font-bold"
        style={{
          width: tamanho,
          height: tamanho,
          fontSize: Math.max(9, Math.round(tamanho * 0.42)),
          background: `color-mix(in srgb, ${corAtual} ${apagado ? 8 : 16}%, transparent)`,
          color: corAtual,
        }}
      >
        {iniciais}
      </span>
      <span
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center rounded-full border-2 border-card text-white"
        style={{ width: selo, height: selo, background: corAtual }}
      >
        <Icone size={Math.max(7, Math.round(selo * 0.62))} strokeWidth={2.6} />
      </span>
    </span>
  );
}
