import { AnunciosCliente } from "./anuncios-cliente";
import { actionObterVisaoGeralAnuncios } from "./actions";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.anuncios.metadataTitle };

function paraISO(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/* `obterVisaoGeral` hoje faz consultas agregadas para todas as marcas, sem o
   antigo N+1. Resolver a primeira janela no servidor elimina a ida adicional
   de Server Action depois da hidratação: filtros e números chegam juntos. */
export default async function AnunciosPage() {
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const periodoServidor = { inicio: paraISO(hoje), fim: paraISO(hoje) };
  const periodoAnterior = { inicio: paraISO(ontem), fim: paraISO(ontem) };
  const [dados, anterior] = await Promise.all([
    actionObterVisaoGeralAnuncios(periodoServidor).catch(() => null),
    actionObterVisaoGeralAnuncios(periodoAnterior).catch(() => null),
  ]);

  return (
    <AnunciosCliente
      periodoServidor={periodoServidor}
      dadosIniciais={dados ? { dados, anterior } : null}
    />
  );
}
