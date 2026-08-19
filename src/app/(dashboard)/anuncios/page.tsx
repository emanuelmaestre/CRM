import { AnunciosCliente } from "./anuncios-cliente";
import { actionObterVisaoGeralAnuncios } from "./actions";
import { actionListarConfiguracaoCanais } from "../configuracoes/actions";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.anuncios.metadataTitle };

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** Mesma janela padrão que a tela usava (últimos 30 dias), só que decidida
 *  aqui — o componente recebe pronta em vez de recalcular, senão a chave do
 *  período poderia não bater com a dos dados já buscados. */
function janelaPadrao() {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 29);
  return { inicio: paraISO(inicio), fim: paraISO(fim) };
}

function janelaAnterior({ inicio, fim }: { inicio: string; fim: string }) {
  const de = new Date(`${inicio}T12:00:00`);
  const ate = new Date(`${fim}T12:00:00`);
  const dias = Math.max(1, Math.round((ate.getTime() - de.getTime()) / 86_400_000) + 1);
  const fimAnterior = new Date(de); fimAnterior.setDate(fimAnterior.getDate() - 1);
  const inicioAnterior = new Date(fimAnterior); inicioAnterior.setDate(inicioAnterior.getDate() - (dias - 1));
  return { inicio: paraISO(inicioAnterior), fim: paraISO(fimAnterior) };
}

/* Esta é a tela onde o desperdício era maior: o navegador abria a página
   vazia e só então disparava três buscas (período atual, período anterior e
   configuração de contas). Resolvidas aqui, as três viajam dentro do HTML da
   primeira resposta.

   Falha não derruba a página: sem dado inicial o componente cai no caminho
   antigo e busca pelo navegador, exatamente como fazia antes. */
export default async function AnunciosPage() {
  const periodo = janelaPadrao();
  const anterior = janelaAnterior(periodo);

  const [dados, dadosAnteriores, contas] = await Promise.all([
    actionObterVisaoGeralAnuncios({ inicio: periodo.inicio, fim: periodo.fim }).catch(() => null),
    actionObterVisaoGeralAnuncios({ inicio: anterior.inicio, fim: anterior.fim }).catch(() => null),
    actionListarConfiguracaoCanais().catch(() => []),
  ]);

  return (
    <AnunciosCliente
      periodoServidor={periodo}
      dadosIniciais={{ dados, anterior: dadosAnteriores }}
      contasIniciais={contas}
    />
  );
}
