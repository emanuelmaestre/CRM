import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import permissionsConfig from "@/config/permissions.json";

/* Guarda contra o buraco real encontrado na auditoria de 15/08/2026:
 * `/estoque/alertas` estava declarado como admin+gestor em permissions.json e
 * `authorization.test.ts` afirmava que vendedor era bloqueado — mas o teste
 * exercitava a função pura `podeAcessarRota`, e a rota nunca a chamava. O
 * layout do grupo (dashboard) faz `requirePageAuth()` sem argumento (exige
 * login, não perfil) e a página era um client component. O contrato existia
 * no JSON e no teste; só não existia no caminho que o navegador percorre.
 *
 * Este teste fecha a lacuna pelo outro lado: para cada prefixo restrito,
 * exige que exista de fato um arquivo no App Router chamando
 * `requirePageRoute`/`requirePageAuth`. Declarar a restrição no JSON sem
 * aplicá-la em lugar nenhum passa a quebrar o CI. */

const APP = join(process.cwd(), "src", "app", "(dashboard)");

/** Arquivos que podem carregar a checagem para um prefixo: o layout/página do
 *  próprio segmento, ou o layout de um segmento ancestral dentro do grupo. */
function arquivosQueProtegem(prefix: string): string[] {
  const segmentos = prefix.replace(/^\//, "").split("/");
  const caminhos: string[] = [];
  for (let i = segmentos.length; i > 0; i -= 1) {
    const base = join(APP, ...segmentos.slice(0, i));
    caminhos.push(join(base, "layout.tsx"), join(base, "page.tsx"));
  }
  return caminhos;
}

describe("rotas restritas aplicam a permissão que declaram", () => {
  it.each(permissionsConfig.routes.map((rota) => [rota.prefix] as const))(
    "%s tem checagem de perfil no servidor",
    (prefix) => {
      const protetor = arquivosQueProtegem(prefix).find((caminho) => {
        if (!existsSync(caminho)) return false;
        const fonte = readFileSync(caminho, "utf8");
        // requirePageRoute resolve o perfil pelo próprio permissions.json;
        // requirePageAuth só vale quando recebe a lista de perfis explícita
        // (sem argumento ele apenas exige sessão — foi exatamente o que
        // deixou /estoque/alertas aberto).
        return /requirePageRoute\s*\(/.test(fonte) || /requirePageAuth\s*\(\s*\[/.test(fonte);
      });

      expect(
        protetor,
        `Nenhum layout.tsx/page.tsx na cadeia de "${prefix}" chama requirePageRoute() ou ` +
        `requirePageAuth([...]). A restrição existe em permissions.json mas não é aplicada.`,
      ).toBeDefined();
    },
  );
});
