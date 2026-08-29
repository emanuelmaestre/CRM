import { EstoqueLista } from "./estoque-lista";
/* De `filtro-estoque`, não de `estoque-lista`: aquele é "use client" e o
   servidor não consegue CHAMAR o que vem de lá — só renderizar como
   componente. Ver o cabeçalho de filtro-estoque.ts. */
import { filtroDaUrl } from "./filtro-estoque";
import { actionObterFiltrosEstoque } from "./actions";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.estoque.metadataTitle };

/* Mesmo motivo do /clientes: as contagens que desenham as pílulas de filtro
   vinham em duas idas ao servidor feitas pelo navegador, depois que o
   JavaScript carregava. Resolvidas aqui, viajam dentro do HTML da primeira
   resposta e a tela nasce com os filtros prontos. */
export default async function EstoquePage(
  { searchParams }: { searchParams: Promise<{ filtro?: string }> },
) {
  const [{ marcas, canais }, { filtro }] = await Promise.all([
    actionObterFiltrosEstoque().catch(() => ({ marcas: [], canais: [] })),
    searchParams,
  ]);

  /* O recorte chega resolvido no servidor em vez de por useSearchParams no
     cliente: assim a lista nasce já filtrada, sem exigir Suspense em volta da
     tela inteira e sem um primeiro quadro mostrando "todos". */
  return (
    <EstoqueLista
      marcasIniciais={marcas}
      canaisIniciais={canais}
      filtroInicial={filtroDaUrl(filtro)}
    />
  );
}
