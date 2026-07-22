export const metadata = {
  title: "Termos de Serviço — KARZI & WUWU CRM",
};

export default function TermosPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 font-sans text-[15px] leading-relaxed text-gray-800">
      <h1 className="text-2xl font-bold mb-2">Termos de Serviço</h1>
      <p className="text-sm text-gray-500 mb-8">Última atualização: julho de 2026</p>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-2">1. Descrição do serviço</h2>
        <p>
          Este sistema de CRM integra pedidos, clientes e estoque das marcas KARZI e WUWU, operadas
          pela Plast Leo Limitada, a partir de canais de venda como TikTok Shop, Mercado Livre e Shopee.
          O acesso é restrito a usuários autorizados da empresa.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-2">2. Uso dos dados</h2>
        <p>
          Os dados de clientes e pedidos coletados via integrações de marketplace são utilizados
          exclusivamente para fins operacionais internos — gestão de pedidos, atendimento ao cliente
          e análise de desempenho. Nenhum dado é compartilhado com terceiros sem autorização expressa.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-2">3. Acesso e segurança</h2>
        <p>
          O acesso ao sistema é protegido por autenticação. Cada usuário é responsável pela
          confidencialidade de suas credenciais. A empresa adota medidas técnicas para proteger
          os dados armazenados, incluindo criptografia em trânsito e controles de acesso por perfil.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-2">4. Integrações de terceiros</h2>
        <p>
          O sistema utiliza APIs de plataformas como TikTok Shop, Mercado Livre e Shopee para
          receber notificações de pedidos. O uso dessas integrações segue os termos de serviço de
          cada respectiva plataforma.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-2">5. Limitação de responsabilidade</h2>
        <p>
          O sistema é fornecido para uso interno. A Plast Leo Limitada não se responsabiliza por
          indisponibilidades de plataformas de terceiros que afetem a sincronização de dados.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-2">6. Contato</h2>
        <p>
          Dúvidas sobre estes termos podem ser encaminhadas para o responsável técnico do sistema.
        </p>
      </section>
    </main>
  );
}
