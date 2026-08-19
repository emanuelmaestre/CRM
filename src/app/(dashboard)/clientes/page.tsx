import { ClientesLista } from "./clientes-lista";
import { actionContarClientesPorCanal, actionContarClientesPorMarca } from "./actions";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.clientes.metadataTitle };

/* As contagens por marca e por canal são o que desenha as pílulas de filtro —
   sem elas a tela abre sem nada em que clicar. Antes elas eram buscadas pelo
   navegador, em dois `useEffect` disparados só depois do JavaScript carregar:
   o servidor mandava a casca vazia, o navegador ligava o React, e só então
   pedia os dados de volta em duas viagens separadas. Buscando aqui, elas já
   viajam dentro do HTML da primeira resposta — uma viagem em vez de três, e a
   tela nasce com as pílulas prontas.

   Falha de uma delas não derruba a página: a lista continua utilizável e o
   próprio componente recarrega a contagem no primeiro filtro que o usuário
   mexer. */
export default async function ClientesPage() {
  const [marcas, canais] = await Promise.all([
    actionContarClientesPorMarca().catch(() => []),
    actionContarClientesPorCanal().catch(() => []),
  ]);

  return <ClientesLista marcasIniciais={marcas} canaisIniciais={canais} />;
}
