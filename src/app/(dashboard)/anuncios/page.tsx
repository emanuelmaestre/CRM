import { AnunciosCliente } from "./anuncios-cliente";
import { actionListarConfiguracaoCanais } from "../configuracoes/actions";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.anuncios.metadataTitle };

/* Só a lista de contas é resolvida aqui: é uma consulta curta.
   A visão geral NÃO entra — `obterVisaoGeral` percorre marca por marca
   disparando três consultas dentro do laço (ver visao-geral.service.ts), e a
   tela precisa dela duas vezes (período atual e anterior). Buscá-la aqui
   prendia a navegação inteira atrás de ~50 consultas em fila: ao clicar em
   Publicidade nada aparecia até tudo terminar. No navegador, a página abre na
   hora e cada bloco preenche quando chega. */
export default async function AnunciosPage() {
  const contas = await actionListarConfiguracaoCanais().catch(() => []);

  return <AnunciosCliente contasIniciais={contas} />;
}
