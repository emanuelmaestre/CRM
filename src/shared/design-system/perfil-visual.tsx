import {
  Briefcase, Code2, Compass, Crown, Handshake, Megaphone, type LucideIcon,
} from "lucide-react";
import type { Perfil } from "@/shared/lib/auth/authorization";

type Visual = { Icone: LucideIcon; cor: string };

/** Ícone e cor de quem está usando o sistema, num lugar só.
 *
 *  Todo mundo aparecia igual na tela: o mesmo círculo roxo com as iniciais,
 *  em cima e na lista de usuários. Descobrir quem era quem exigia ler o
 *  rótulo de cargo, letra a letra, em cada linha.
 *
 *  Quem manda aqui é o CARGO, não o perfil de acesso. Na prática todo usuário
 *  criado hoje nasce `admin` (ver o comentário em UsuariosSection), então o
 *  perfil não separa ninguém de ninguém — o que de fato distingue as pessoas
 *  do time é "Diretor", "Publicitário", "Desenvolvedor". O perfil fica como
 *  base para quando o cargo é vazio ou é algo que ninguém previu. */
const POR_CARGO: Array<{ casa: RegExp; visual: Visual }> = [
  { casa: /^diretor/, visual: { Icone: Compass, cor: "var(--acento-1)" } },
  { casa: /^publicit/, visual: { Icone: Megaphone, cor: "var(--acento-3)" } },
  { casa: /^(desenvolvedor|dev|programador)/, visual: { Icone: Code2, cor: "var(--info)" } },
  { casa: /^(administrador|admin)/, visual: { Icone: Crown, cor: "var(--acento-2)" } },
  { casa: /^(gestor|gerente)/, visual: { Icone: Briefcase, cor: "var(--info)" } },
  { casa: /^(vendedor|vendas)/, visual: { Icone: Handshake, cor: "var(--success)" } },
];

/** Coroa para quem administra, pasta para quem gere, aperto de mão para quem
 *  vende. Nenhuma das cores é vermelha ou âmbar, que neste sistema já
 *  significam problema com dinheiro. */
const POR_PERFIL: Record<Perfil, Visual> = {
  admin: { Icone: Crown, cor: "var(--acento-2)" },
  gestor: { Icone: Briefcase, cor: "var(--info)" },
  vendedor: { Icone: Handshake, cor: "var(--success)" },
};

/** Sem acento e em minúsculas: "Publicitário" e "publicitario" são a mesma
 *  pessoa, e o cargo é texto livre digitado por quem cria o usuário. */
function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function visualDoPerfil(perfil: Perfil, cargo?: string | null): Visual {
  if (cargo) {
    const limpo = normalizar(cargo);
    const achado = POR_CARGO.find(({ casa }) => casa.test(limpo));
    if (achado) return achado.visual;
  }
  return POR_PERFIL[perfil] ?? POR_PERFIL.admin;
}

/** Avatar com as iniciais na cor da pessoa e o ícone do cargo num selo.
 *
 *  As iniciais continuam sendo o identificador — num time com dois diretores,
 *  o ícone sozinho não diz qual deles é. O selo é a camada de cima: diz o
 *  papel sem tirar o nome do lugar. */
export function PerfilAvatar({ perfil, cargo, iniciais, tamanho = 24, apagado = false, className = "" }: {
  perfil: Perfil;
  /** Cargo digitado no cadastro. Tem prioridade sobre o perfil. */
  cargo?: string | null;
  iniciais: string;
  /** Diâmetro do círculo em px. O selo acompanha proporcionalmente. */
  tamanho?: number;
  /** Usuário pausado: o papel continua legível, mas sem chamar atenção. */
  apagado?: boolean;
  className?: string;
}) {
  const { Icone, cor } = visualDoPerfil(perfil, cargo);
  const corAtual = apagado ? "var(--muted-foreground)" : cor;
  const selo = Math.round(tamanho * 0.42);
  /* O selo sai da roda em vez de pousar em cima dela. Encostado na borda por
     dentro, num círculo de 26px ele cobria as iniciais — o "E" ficava atrás
     da coroa. Deslocado por um terço do próprio tamanho, fica no canto,
     tocando a borda e mordendo só o vazio da quina. */
  const recuo = -Math.round(selo * 0.34);

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
        className="absolute inline-flex items-center justify-center rounded-full border-2 border-card text-white"
        style={{ width: selo, height: selo, bottom: recuo, right: recuo, background: corAtual }}
      >
        <Icone size={Math.max(7, Math.round(selo * 0.6))} strokeWidth={2.6} />
      </span>
    </span>
  );
}
