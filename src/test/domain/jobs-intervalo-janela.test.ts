import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/* O A24 busca os pedidos de uma janela a cada volta do cron. Se a janela for
   menor que o intervalo entre as voltas, abre um buraco: pedido criado dentro
   do buraco não é visto por volta nenhuma e some para sempre.

   Estiveram desalinhados de fato — cron de 4 em 4 minutos com janela de 10
   minutos (folga por acaso, não por desenho). Ao espaçar o cron para 3 horas
   em 25/08/2026, manter a janela de 10 minutos teria escondido 2h50 de vendas
   a cada volta. Este teste existe pra que mexer num sem o outro quebre aqui,
   e não em produção meses depois.

   Lê o fonte em vez de importar o módulo porque importar arrasta db, Inngest e
   providers — caro e frágil para verificar duas constantes. */

const fonte = fs.readFileSync(
  path.join(process.cwd(), "src/modules/jobs/A24-poll-pedidos.ts"),
  "utf8",
);

function expressaoDe(nome: string): string {
  const achado = fonte.match(new RegExp(`const ${nome} = ([^;]+);`));
  if (!achado) throw new Error(`Constante ${nome} não encontrada em A24-poll-pedidos.ts`);
  return achado[1].trim();
}

/** Resolve a expressão da constante substituindo INTERVALO_POLL_HORAS pelo seu
 *  valor. Só aceita aritmética simples — qualquer outra coisa é erro, para o
 *  teste nunca avaliar código arbitrário do fonte. */
function valorDe(nome: string, intervaloHoras: number): number {
  const expressao = expressaoDe(nome).replace(/INTERVALO_POLL_HORAS/g, String(intervaloHoras));
  const aritmetica = expressao.replace(/_/g, "");
  if (!/^[\d\s*+()]+$/.test(aritmetica)) {
    throw new Error(`Expressão inesperada em ${nome}: ${expressao}`);
  }
  return Function(`"use strict"; return (${aritmetica});`)() as number;
}

describe("A24 — janela de busca cobre o intervalo do cron", () => {
  const intervaloHoras = Number(expressaoDe("INTERVALO_POLL_HORAS"));
  const janelaMs = valorDe("JANELA_BUSCA_MS", intervaloHoras);

  it("declara as duas constantes", () => {
    expect(intervaloHoras).toBeGreaterThan(0);
    expect(janelaMs).toBeGreaterThan(0);
  });

  it("a janela é maior que o intervalo, com folga de sobreposição", () => {
    const intervaloMs = intervaloHoras * 60 * 60 * 1_000;
    expect(janelaMs).toBeGreaterThan(intervaloMs);
  });

  it("o cron declarado usa o mesmo intervalo das constantes", () => {
    const cron = fonte.match(/cron: `0 \*\/\$\{INTERVALO_POLL_HORAS\} \* \* \*`/);
    expect(cron, "o cron deve derivar de INTERVALO_POLL_HORAS, não ser escrito à mão").not.toBeNull();
  });

  it("a busca combina o marcador persistido com a janela mínima", () => {
    expect(fonte).toContain("inicioColetaPedidos(Date.parse(ateIso), meta?.pedidosUltimaColetaCompleta, JANELA_BUSCA_MS)");
  });
});

/* Mesmo cuidado no A5, por outro motivo: lá o cron não tem janela pareada, mas
   a desativação de anúncio encerrado espera HORAS_PARA_DESATIVAR de status
   "closed" ININTERRUPTO. Como a checagem só acontece quando o job roda, um
   intervalo maior que essa espera faria a condição nunca se confirmar — o
   produto jamais seria desativado. */
describe("A5 — intervalo da coleta cabe na janela de desativação", () => {
  const fonteA5 = fs.readFileSync(
    path.join(process.cwd(), "src/modules/jobs/A5-reconciliacao-saldo.ts"),
    "utf8",
  );
  const numeroA5 = (nome: string) => {
    const achado = fonteA5.match(new RegExp(`const ${nome} = (\\d+);`));
    if (!achado) throw new Error(`Constante ${nome} não encontrada em A5-reconciliacao-saldo.ts`);
    return Number(achado[1]);
  };
  const intervaloHoras = numeroA5("INTERVALO_COLETA_HORAS");
  const horasParaDesativar = numeroA5("HORAS_PARA_DESATIVAR");

  it("roda mais de uma vez dentro da janela de desativação", () => {
    expect(intervaloHoras).toBeLessThan(horasParaDesativar);
  });

  it("o cron declarado deriva do intervalo, não é escrito à mão", () => {
    expect(fonteA5).toContain("cron: `0 */${INTERVALO_COLETA_HORAS} * * *`");
  });
});
