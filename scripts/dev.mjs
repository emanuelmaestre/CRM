// Sobe o servidor de desenvolvimento com folga de cabeçalho HTTP.
//
// Cookies em localhost são compartilhados entre TODAS as portas, então tudo que
// já rodou em :3000, :5173 e afins manda seus cookies junto para a 3001. Somado
// ao token do Supabase — um JWT partido em vários pedaços — o cabeçalho passa
// do limite padrão de 16 KB do Node, que responde 431 antes de a aplicação ver
// o pedido. 64 KB dá folga suficiente para isso não acontecer no dia a dia.
//
// Existe como script em vez de um prefixo "NODE_OPTIONS=..." no package.json
// porque essa sintaxe não funciona no Windows, onde os scripts npm passam pelo
// cmd.exe. Aqui a variável é montada em processo e herdada pelo filho, o que
// funciona igual nos três sistemas.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const TAMANHO_MAXIMO_CABECALHO = 65536;

const opcoes = [
  process.env.NODE_OPTIONS,
  `--max-http-header-size=${TAMANHO_MAXIMO_CABECALHO}`,
]
  .filter(Boolean)
  .join(" ");

// Chama o binário do Next direto via node, sem passar por "npx" nem por um
// shell — no Windows "npx" é um .cmd, que só roda com shell: true, e o Node
// avisa (DEP0190) que argumentos em array não são escapados nesse modo.
// Resolver o caminho do binário evita o shell inteiramente, sem mudar o
// comportamento em nenhum sistema.
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const filho = spawn(
  process.execPath,
  [nextBin, "dev", "-p", process.env.PORT ?? "3001"],
  {
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: opcoes },
  },
);

filho.on("exit", (codigo, sinal) => {
  if (sinal) process.kill(process.pid, sinal);
  else process.exit(codigo ?? 0);
});
