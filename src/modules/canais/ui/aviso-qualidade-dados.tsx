import Link from "next/link";
import { consultarQualidadeDados } from "../application/qualidade-dados.service";

const nomes: Record<string, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", tiktokshop: "TikTok Shop" };

export async function AvisoQualidadeDados({ orgId }: { orgId: string }) {
  let contas;
  try {
    contas = await consultarQualidadeDados(orgId);
  } catch (error) {
    console.error("[qualidade-dados] não foi possível consultar a cobertura", error);
    return <aside role="alert" className="m-4 rounded-lg border border-amber-400/50 bg-amber-500/10 p-4 text-sm">
      Não foi possível verificar a integridade dos dados. Isso não significa ausência de pendências.
      Consulte a Central de Sincronização antes de conferir os totais.
    </aside>;
  }
  const pendentes = contas.reduce((n, c) => n + c.pendentes + c.quarentena, 0);
  const semConexao = contas.filter((c) => c.status !== "conectado").length;
  const estoque = contas.reduce((n, c) => n + c.estoquePendente, 0);
  const falhasEstoque = contas.reduce((n, c) => n + (Array.isArray(c.estoqueFalhas) ? c.estoqueFalhas.length : 0), 0);
  return <aside aria-label="Integridade dos dados dos canais" className="m-4 rounded-lg border border-amber-400/50 bg-amber-500/10 p-4 text-sm">
    <p className="font-semibold">Conferência com os canais ainda não certificada</p>
    <p className="mt-1">{pendentes} pendências de pedidos · {semConexao} contas sem conexão saudável · {estoque} vínculos de estoque sem leitura recente.</p>
    {falhasEstoque > 0 && <p role="alert" className="mt-1 font-medium">{falhasEstoque} falhas de estoque registradas. Veja os anúncios e motivos abaixo.</p>}
    <p className="mt-1 text-xs">Visão de todas as empresas da organização, independente dos filtros desta tela. Uma fila vazia não prova que todos os dados chegaram. Estoque publicado não é inventário físico; notas e opiniões com texto ou mídia são contagens diferentes.</p>
    <details className="mt-2">
      <summary className="cursor-pointer font-medium">Ver situação por empresa e canal</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr><th className="p-2">Empresa / canal</th><th className="p-2">Conexão</th><th className="p-2">Pedidos pendentes</th><th className="p-2">Estoque sem leitura até 8h</th><th className="p-2">Última coleta completa de alterações</th><th className="p-2">Avaliação mais antiga do cache</th></tr></thead>
          <tbody>{contas.map((c) => <tr key={c.id} className="border-t border-amber-400/20">
            <td className="p-2">{c.marca} / {nomes[c.canal] ?? c.canal}</td><td className="p-2">{c.status}</td>
            <td className="p-2">{c.pendentes} na fila{c.quarentena > 0 ? ` + ${c.quarentena} na importação histórica` : ""}</td>
            <td className="p-2">{c.estoquePendente}</td><td className="p-2">{data(c.ultimaColeta)}</td>
            <td className="p-2">{c.canal === "tiktokshop" ? "Sem integração de avaliações" : data(c.ultimaAvaliacao)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {contas.flatMap((c) => (Array.isArray(c.estoqueFalhas) ? c.estoqueFalhas : []).map((f) => <p key={`${c.id}:${f.listingId}`} className="mt-2 text-xs">
        {c.marca} / {nomes[c.canal]} · Anúncio {f.listingId}: {f.erro}
      </p>))}
      <p className="mt-2 text-xs">Pedidos que falharam antes de serem identificados não têm contagem conhecida. A recuperação da fila incorpora a quarentena histórica e reconsulta o estado atual no canal, em lotes de até 20. As datas acima indicam cobertura da coleta, não igualdade com o painel oficial.</p>
    </details>
    <div className="mt-2 flex flex-wrap gap-4 underline">
      <Link href="/configuracoes">Ver conexões e sincronização</Link>
    </div>
  </aside>;
}

function data(valor: string | null) {
  if (!valor || !Number.isFinite(Date.parse(valor))) return "Sem registro completo";
  return new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
