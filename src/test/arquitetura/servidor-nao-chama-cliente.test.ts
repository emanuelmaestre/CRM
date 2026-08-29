import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Server Component não pode CHAMAR função exportada de módulo "use client".
 *
 *  O export de um módulo cliente não é a função — é uma referência que o
 *  servidor só sabe renderizar como componente ou repassar como prop. Chamar
 *  derruba a rota inteira em tempo de requisição:
 *
 *    Attempted to call filtroDaUrl() from the server but filtroDaUrl is on
 *    the client.
 *
 *  Aconteceu de verdade em /estoque e ficou no ar sem ninguém ver, porque
 *  NENHUMA das barreiras pega: `tsc` só olha tipo, e o `next build` compila
 *  sem reclamar — o erro nasce na primeira visita. Sem este teste, a próxima
 *  vez também só aparece em produção.
 *
 *  O critério é a inicial do identificador, a mesma convenção que o React usa
 *  para separar componente de função: `EstoqueLista` importado de um módulo
 *  cliente é legítimo, `filtroDaUrl` é o defeito. `import type` não conta —
 *  tipo some na compilação e nunca vira referência. */

const RAIZ_APP = resolve(__dirname, "../../app");

function arquivosDeRota(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((entrada) => {
    const caminho = join(diretorio, entrada);
    if (statSync(caminho).isDirectory()) return arquivosDeRota(caminho);
    return /^(page|layout|template|default)\.tsx?$/.test(entrada) ? [caminho] : [];
  });
}

function ehModuloCliente(caminho: string): boolean {
  return /^\s*(["'])use client\1/.test(readFileSync(caminho, "utf8"));
}

/** Resolve "./estoque-lista" para o arquivo real, testando as extensões que o
 *  bundler testaria. */
function resolverRelativo(deOnde: string, especificador: string): string | null {
  const base = resolve(dirname(deOnde), especificador);
  for (const tentativa of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    const caminho = `${base}${tentativa}`;
    try {
      if (statSync(caminho).isFile()) return caminho;
    } catch { /* extensão seguinte */ }
  }
  return null;
}

const IMPORTACAO = /import\s+(type\s+)?([^;]*?)\s+from\s+["'](\.[^"']*)["']/g;

function importacoesDeValor(fonte: string): Array<{ nomes: string[]; alvo: string }> {
  const encontradas: Array<{ nomes: string[]; alvo: string }> = [];
  for (const [, ehTipo, clausula, alvo] of fonte.matchAll(IMPORTACAO)) {
    if (ehTipo) continue;
    const chaves = clausula.match(/\{([^}]*)\}/)?.[1] ?? "";
    const nomes = chaves
      .split(",")
      .map((parte) => parte.trim())
      .filter((parte) => parte.length > 0 && !parte.startsWith("type "))
      .map((parte) => (parte.split(/\s+as\s+/)[1] ?? parte).trim());
    // O import default (`import X from`) é sempre componente na prática.
    if (nomes.length > 0) encontradas.push({ nomes, alvo });
  }
  return encontradas;
}

describe("fronteira servidor/cliente nas rotas", () => {
  const rotasServidor = arquivosDeRota(RAIZ_APP).filter((caminho) => !ehModuloCliente(caminho));

  it("existem rotas de servidor para inspecionar", () => {
    expect(rotasServidor.length).toBeGreaterThan(10);
  });

  it("nenhuma importa função (não-componente) de módulo \"use client\"", () => {
    const infracoes: string[] = [];

    for (const rota of rotasServidor) {
      const fonte = readFileSync(rota, "utf8");
      for (const { nomes, alvo } of importacoesDeValor(fonte)) {
        const destino = resolverRelativo(rota, alvo);
        if (!destino || !ehModuloCliente(destino)) continue;
        for (const nome of nomes) {
          // Maiúscula = componente: renderizar é permitido. Minúscula é
          // função, e função de módulo cliente não existe no servidor.
          if (/^[a-z]/.test(nome)) {
            infracoes.push(
              `${rota.replace(RAIZ_APP, "src/app")} importa "${nome}" de "${alvo}" ("use client")`,
            );
          }
        }
      }
    }

    expect(infracoes).toEqual([]);
  });
});
