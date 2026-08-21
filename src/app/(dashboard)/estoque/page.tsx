import { EstoqueLista } from "./estoque-lista";
import { actionObterFiltrosEstoque } from "./actions";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.estoque.metadataTitle };

/* Mesmo motivo do /clientes: as contagens que desenham as pílulas de filtro
   vinham em duas idas ao servidor feitas pelo navegador, depois que o
   JavaScript carregava. Resolvidas aqui, viajam dentro do HTML da primeira
   resposta e a tela nasce com os filtros prontos. */
export default async function EstoquePage() {
  const { marcas, canais } = await actionObterFiltrosEstoque()
    .catch(() => ({ marcas: [], canais: [] }));

  return <EstoqueLista marcasIniciais={marcas} canaisIniciais={canais} />;
}
