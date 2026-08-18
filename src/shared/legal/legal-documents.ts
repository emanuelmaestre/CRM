import { Boxes, Handshake } from "lucide-react";

export type LegalLocale = "pt" | "en";
export type LegalDocumentKind = "terms" | "privacy";

export interface LegalSource {
  label: string;
  href: string;
}

export interface LegalSection {
  id: string;
  title: string;
  eyebrow: string;
  icon: "badge" | "database" | "file" | "lock" | "shield" | "shop" | "store" | "user";
  summary: string;
  body: string[];
  bullets?: string[];
  table?: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
}

export interface LegalDocument {
  kind: LegalDocumentKind;
  locale: LegalLocale;
  title: string;
  metadataTitle: string;
  description: string;
  lastUpdated: string;
  alternateHref: string;
  alternateLabel: string;
  sections: LegalSection[];
  commitments: string[];
  sources: LegalSource[];
  contact: {
    title: string;
    emailLabel: string;
    email: string;
    addressLabel: string;
    address: string;
    companyLabel: string;
    company: Array<{ label: string; document: string }>;
  };
}

const updatedPt = "Atualizado em 18 de agosto de 2026";
const updatedEn = "Last updated on August 18, 2026";
const operatorCompanyPt = [
  { label: "ELISA LIMA HAUTE COUTURE E COMERCIO DE ROUPAS LTDA", document: "CNPJ 24.264.245/0001-94" },
  { label: "KARZI", document: "CNPJ 57.899.124/0001-78" },
  { label: "WUWU", document: "CNPJ 57.899.124/0001-78" },
  { label: "ARMARINHOS LIMA", document: "CNPJ 24.264.245/0001-94" },
];
const operatorCompanyEn = [
  { label: "ELISA LIMA HAUTE COUTURE E COMERCIO DE ROUPAS LTDA", document: "Brazilian company registration 24.264.245/0001-94" },
  { label: "KARZI", document: "Brazilian company registration 57.899.124/0001-78" },
  { label: "WUWU", document: "Brazilian company registration 57.899.124/0001-78" },
  { label: "ARMARINHOS LIMA", document: "Brazilian company registration 24.264.245/0001-94" },
];

export const legalDocuments = {
  pt: {
    terms: {
      kind: "terms",
      locale: "pt",
      title: "Termos de Serviço",
      metadataTitle: "Termos de Serviço - Elisa Lima CRM",
      description:
        "Regras de uso do Elisa Lima CRM, incluindo integrações com Mercado Livre, TikTok Shop e Shopee para operação de catálogo, pedidos, atendimento e métricas.",
      lastUpdated: updatedPt,
      alternateHref: "/terms",
      alternateLabel: "English",
      commitments: [
        "Uso restrito a usuários autorizados das marcas KARZI, WUWU e ARMARINHOS LIMA.",
        "Nenhuma publicação, alteração de anúncio ou ação externa ocorre sem autorização do usuário ou regra operacional registrada.",
        "Dados de Mercado Livre, TikTok Shop e Shopee são usados somente para desenvolver, operar e manter as integrações do CRM.",
      ],
      sections: [
        {
          id: "servico",
          title: "Serviço e acesso",
          eyebrow: "Base do contrato",
          icon: "file",
          summary: "O CRM é uma ferramenta corporativa privada para operação comercial e atendimento.",
          body: [
            "O Elisa Lima CRM é o sistema interno usado para consolidar clientes, pedidos, produtos, estoque, anúncios, mensagens, avaliações, indicadores e rotinas operacionais das marcas KARZI, WUWU e ARMARINHOS LIMA.",
            "O acesso é individual, intransferível e depende de autorização da operadora. O usuário deve manter suas credenciais em sigilo e comunicar suspeitas de acesso indevido.",
            "A plataforma não é uma loja aberta ao público. Ela organiza dados operacionais recebidos de marketplaces, canais de venda e ferramentas conectadas.",
          ],
          bullets: [
            "Contas podem ser suspensas em caso de violação, desligamento ou risco de segurança.",
            "Logs de auditoria podem registrar ações relevantes para prevenção de fraude e rastreabilidade.",
            "O uso continuado após atualizações destes termos indica ciência da versão vigente.",
          ],
        },
        {
          id: "uso-aceitavel",
          title: "Uso aceitável",
          eyebrow: "Regras de operação",
          icon: "badge",
          summary: "O usuário deve operar o CRM de forma lícita, segura e compatível com as plataformas conectadas.",
          body: [
            "É proibido usar o CRM para finalidade ilícita, enganosa, ofensiva, discriminatória, fraudulenta, invasiva ou que viole direitos de propriedade intelectual, privacidade ou regras dos marketplaces.",
            "Também é proibido compartilhar credenciais, extrair dados em massa fora das funções previstas, tentar burlar limites técnicos, publicar conteúdo sem revisão adequada ou usar dados de clientes para finalidade incompatível com a operação das marcas.",
          ],
          bullets: [
            "Conteúdos abusivos ou denúncias podem ser enviados para contato@elisalima.com.br.",
            "Denúncias serão revisadas com prioridade operacional, com remoção ou bloqueio quando a violação for confirmada.",
            "O CRM pode limitar recursos quando uma plataforma de terceiro alterar regras, permissões ou disponibilidade.",
          ],
        },
        {
          id: "mercado-livre",
          title: "Integração Mercado Livre",
          eyebrow: "API e escopos",
          icon: "store",
          summary: "A integração usa a API oficial do Mercado Livre, com autorização OAuth por conta e escopos limitados à operação contratada.",
          body: [
            "A conexão com o Mercado Livre depende de autorização OAuth concedida pelo próprio vendedor e dos escopos aprovados para o aplicativo. O CRM solicita apenas as permissões necessárias para operar catálogo, pedidos, mensagens, reputação e métricas.",
            "Dados obtidos pela API do Mercado Livre são usados somente para desenvolver, operar e manter as funcionalidades do CRM autorizadas pela conta conectada. Eles não são vendidos, repassados a corretores de dados nem usados para treinar modelos de IA.",
            "O uso da integração também está sujeito aos Termos e Condições de uso da API e às políticas de proteção de dados do Mercado Livre, incluindo os requisitos de segurança para aplicativos parceiros.",
          ],
          table: [
            {
              label: "Conta e loja",
              value: "Identificação do vendedor conectado",
              detail: "Exibir ao operador qual conta do Mercado Livre está autorizada antes de executar ações.",
            },
            {
              label: "Pedidos e catálogo",
              value: "Sincronização operacional",
              detail: "Consultar pedidos, anúncios, estoque e status para atendimento, separação, conciliação e relatórios.",
            },
            {
              label: "Reputação e métricas",
              value: "Indicadores de desempenho",
              detail: "Acompanhar reputação, avaliações e métricas para gestão interna, sem uso externo ou publicitário.",
            },
          ],
        },
        {
          id: "tiktok-shop",
          title: "Integração TikTok Shop",
          eyebrow: "API e revisão",
          icon: "shop",
          summary: "A integração usa permissões necessárias para catálogo, pedidos, conteúdo, anúncios e métricas autorizadas.",
          body: [
            "A conexão com TikTok Shop depende de autorização no fluxo oficial da plataforma e dos escopos aprovados para o aplicativo. O CRM solicita apenas permissões necessárias para operar as funcionalidades contratadas.",
            "Quando houver publicação, alteração de conteúdo ou uso de dados protegidos, o CRM deve preservar revisão humana, rastreabilidade e finalidade operacional. Dados obtidos pela API não são vendidos, repassados a corretores de dados nem usados para treinar modelos de IA.",
            "O uso da integração também está sujeito aos termos, políticas de privacidade, regras de conteúdo, requisitos de revisão e controles de segurança da TikTok Shop.",
          ],
          table: [
            {
              label: "Conta e loja",
              value: "Identificação da conta conectada",
              detail: "Exibir ao operador qual loja ou perfil está autorizado antes de executar ações.",
            },
            {
              label: "Pedidos e catálogo",
              value: "Sincronização operacional",
              detail: "Consultar pedidos, produtos, estoque e status para atendimento, separação, conciliação e relatórios.",
            },
            {
              label: "Conteúdo e métricas",
              value: "Revisão e desempenho",
              detail: "Apoiar publicação revisada, leitura de indicadores e acompanhamento interno das campanhas.",
            },
          ],
        },
        {
          id: "shopee",
          title: "Integração Shopee",
          eyebrow: "Open Platform",
          icon: "store",
          summary: "A integração Shopee trata dados do marketplace apenas como intermediária operacional.",
          body: [
            "A conexão com Shopee Open Platform é usada para desenvolver, operar e manter recursos de loja, produtos, pedidos, logística, atendimento, marketing e mensageria quando autorizados pela conta da loja.",
            "Em relação a dados pessoais obtidos ou derivados de conteúdo da Shopee, o CRM atua como intermediário operacional entre a loja autorizada e a plataforma, processando dados somente conforme a finalidade da aplicação, as instruções da Shopee e a legislação aplicável.",
            "Dados sensíveis ou protegidos, como nome, telefone, endereço e informações de pedido, devem ficar limitados a usuários autorizados, telas necessárias e rotinas de atendimento, envio, suporte, auditoria e obrigação legal.",
          ],
          table: [
            {
              label: "Pedidos",
              value: "Cliente, itens, pagamento e entrega",
              detail: "Usado para faturamento, separação, suporte, atualização de status e histórico comercial.",
            },
            {
              label: "Produtos",
              value: "SKU, anúncio, estoque e preço",
              detail: "Usado para manter catálogo sincronizado e reduzir divergências operacionais.",
            },
            {
              label: "Atendimento",
              value: "Mensagens e solicitações",
              detail: "Usado para responder compradores, tratar pós-venda e manter trilha de atendimento.",
            },
          ],
        },
        {
          id: "responsabilidade",
          title: "Segurança, terceiros e encerramento",
          eyebrow: "Limites",
          icon: "shield",
          summary: "O CRM protege a operação, mas depende de serviços externos e permissões concedidas.",
          body: [
            "A operadora adota medidas razoáveis de segurança, controle de acesso, auditoria, criptografia em trânsito e armazenamento protegido de segredos e tokens.",
            "A disponibilidade das integrações depende das plataformas de terceiro, de seus ambientes, políticas, aprovações e limites de API. O CRM pode ficar indisponível parcial ou totalmente em caso de manutenção, bloqueio, expiração de autorização ou falha externa.",
            "O usuário pode solicitar encerramento de conta ou revogação de integração. A operadora pode encerrar acesso em caso de violação destes termos, obrigação legal, risco de segurança ou fim do vínculo operacional.",
          ],
        },
      ],
      sources: [
        { label: "Mercado Livre Developers - Termos e Condições de Uso", href: "https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes" },
        { label: "Mercado Livre - Central de Privacidade", href: "https://www.mercadolivre.com.br/privacidade" },
        { label: "TikTok Shop - Developer Terms of Service", href: "https://partner.tiktokshop.com/docv2/page/6506bc942f024f02be400315" },
        { label: "TikTok Shop - Data security and privacy review", href: "https://partner.tiktokshop.com/docv2/page/data-security-and-privacy-review" },
        { label: "Shopee Open Platform - Terms of Service", href: "https://open.shopee.com/developer-guide/36" },
        { label: "Shopee Open Platform - Data Protection Policy", href: "https://open.shopee.com/developer-guide/32" },
        { label: "Shopee Open Platform - Sensitive Data", href: "https://open.shopee.com/developer-guide/718" },
      ],
      contact: {
        title: "Contato da operadora",
        emailLabel: "E-mail",
        email: "contato@elisalima.com.br",
        addressLabel: "Endereço",
        address: "São Paulo - SP, Brasil",
        companyLabel: "CNPJ",
        company: operatorCompanyPt,
      },
    },
    privacy: {
      kind: "privacy",
      locale: "pt",
      title: "Política de Privacidade",
      metadataTitle: "Política de Privacidade - Elisa Lima CRM",
      description:
        "Como o Elisa Lima CRM coleta, usa, protege, retém e exclui dados pessoais em integrações operacionais com Mercado Livre, TikTok Shop, Shopee e demais canais.",
      lastUpdated: updatedPt,
      alternateHref: "/privacy",
      alternateLabel: "English",
      commitments: [
        "Não vendemos dados pessoais nem dados de plataforma.",
        "Não usamos dados de Mercado Livre, TikTok Shop ou Shopee para publicidade externa, enriquecimento de bases ou treinamento de IA.",
        "Tokens e dados protegidos ficam restritos a finalidades operacionais, auditoria, segurança e obrigações legais.",
      ],
      sections: [
        {
          id: "controlador",
          title: "Controlador e escopo",
          eyebrow: "LGPD",
          icon: "user",
          summary: "Esta política cobre usuários internos, clientes, pedidos e dados recebidos por integrações autorizadas.",
          body: [
            "O Elisa Lima CRM trata dados pessoais em conformidade com a LGPD e, quando aplicável, com normas internacionais de proteção de dados. A plataforma é de uso corporativo privado.",
            "A operadora define as finalidades internas do CRM para usuários, clientes e operação comercial. Para dados obtidos ou derivados de Shopee Content, o CRM trata esses dados como intermediário operacional, conforme regras da Shopee Open Platform.",
          ],
          bullets: [
            "Contato de privacidade: privacidade@elisalima.com.br.",
            "A plataforma é restrita a maiores de 18 anos e usuários autorizados.",
            "Solicitações de titulares são respondidas pelos canais informados nesta política.",
          ],
        },
        {
          id: "dados",
          title: "Dados coletados",
          eyebrow: "Categorias",
          icon: "database",
          summary: "Coletamos apenas dados necessários para autenticação, operação, suporte, integrações e segurança.",
          body: [
            "Dados de usuários incluem nome, e-mail, perfil de acesso, permissões, registros de atividade, endereço IP, navegador, dispositivo e eventos de segurança.",
            "Dados de clientes e pedidos podem incluir nome, telefone, e-mail, endereço de entrega, produtos comprados, status de pagamento, status logístico, mensagens de atendimento, avaliações e histórico comercial.",
            "Dados técnicos de integração incluem identificadores de loja, contas conectadas, tokens, horários de sincronização, payloads necessários, erros operacionais e logs de auditoria.",
          ],
          table: [
            { label: "Autenticação", value: "Usuário e sessão", detail: "Permitir login, perfis, permissões e segurança." },
            { label: "Operação comercial", value: "Clientes, pedidos e produtos", detail: "Executar atendimento, envio, estoque, conciliação e métricas." },
            { label: "Integrações", value: "Tokens e identificadores", detail: "Manter conexões autorizadas e rotinas de sincronização." },
          ],
        },
        {
          id: "mercado-livre",
          title: "Dados Mercado Livre",
          eyebrow: "API oficial",
          icon: "store",
          summary: "Dados do Mercado Livre são obtidos pela API oficial e usados apenas dentro dos escopos autorizados pelo vendedor.",
          body: [
            "Quando uma conta autoriza a integração via OAuth, o CRM pode acessar dados permitidos pelos escopos aprovados: identificação do vendedor, catálogo, pedidos, status de envio, mensagens, reputação e métricas necessárias para operar a conexão.",
            "A API do Mercado Livre não disponibiliza telefone ou e-mail do comprador: por isso o CRM não realiza nem automatiza contato direto com clientes de pedidos do Mercado Livre fora das mensagens trocadas pelo próprio canal oficial da plataforma.",
            "Esses dados não são vendidos, licenciados, transferidos a corretores de dados, usados para treinar modelos de IA ou combinados com bases externas para identificar pessoas. A revogação da autorização invalida tokens e interrompe novas coletas.",
          ],
          bullets: [
            "Reputação e métricas são usadas somente para gestão interna, nunca para publicidade externa.",
            "Dados de pedido ficam disponíveis somente a perfis autorizados e às rotinas de atendimento, envio e conciliação.",
            "Segredos e tokens de acesso ficam em armazenamento seguro, nunca em código-fonte.",
          ],
        },
        {
          id: "tiktok",
          title: "Dados TikTok Shop",
          eyebrow: "Finalidade limitada",
          icon: "shop",
          summary: "Dados da TikTok Shop são usados somente para funcionalidades autorizadas e revisão operacional.",
          body: [
            "Quando uma conta autoriza a integração, o CRM pode acessar dados permitidos pelos escopos aprovados: identificação da loja ou perfil, catálogo, pedidos, status, conteúdo, métricas e informações necessárias para operar a conexão.",
            "Esses dados não são vendidos, licenciados, transferidos a corretores de dados, usados para publicidade direcionada fora da própria plataforma, usados para treinar IA ou combinados com bases externas para identificar pessoas.",
            "A revogação da autorização invalida tokens e interrompe novas coletas. Dados importados são excluídos, anonimizados ou retidos apenas quando necessários para auditoria, segurança, suporte, obrigação legal ou exercício regular de direitos.",
          ],
          bullets: [
            "Conteúdo não deve ser publicado sem revisão e confirmação quando a funcionalidade exigir ação humana.",
            "Dados protegidos ficam disponíveis somente a perfis autorizados.",
            "Segredos devem permanecer em variáveis de ambiente ou armazenamento seguro, nunca em código-fonte.",
          ],
        },
        {
          id: "shopee",
          title: "Dados Shopee",
          eyebrow: "Intermediário",
          icon: "store",
          summary: "Dados da Shopee são tratados em nome da loja autorizada e dentro da finalidade aprovada.",
          body: [
            "A Shopee Open Platform protege dados de negócio dos vendedores e dados pessoais considerados sensíveis, incluindo dados como nome, telefone e endereço. O CRM limita acesso a esses dados conforme necessidade operacional.",
            "Em relação a dados pessoais obtidos ou derivados de Shopee Content, o CRM processa os dados somente para desenvolver, operar e manter a aplicação, em conformidade com os termos da Shopee, instruções aplicáveis e legislação de privacidade.",
            "O CRM não usa dados da Shopee para finalidade própria incompatível, publicidade externa, corretagem de dados, enriquecimento de bases, scraping ou treinamento de IA.",
          ],
          table: [
            { label: "Retenção", value: "Pelo prazo necessário", detail: "Pedidos e logs seguem prazos fiscais, civis, suporte, segurança e auditoria." },
            { label: "Acesso", value: "Menor privilégio", detail: "Somente perfis autorizados veem dados de comprador, entrega e atendimento." },
            { label: "Exclusão", value: "Revogação ou solicitação", detail: "Tokens são invalidados e dados são removidos ou anonimizados quando aplicável." },
          ],
        },
        {
          id: "direitos",
          title: "Segurança, direitos e contato",
          eyebrow: "Governança",
          icon: "lock",
          summary: "Titulares podem solicitar acesso, correção, oposição, revogação e exclusão conforme a lei aplicável.",
          body: [
            "A plataforma usa HTTPS, controle de acesso por perfil, logs de auditoria, backups, proteção de tokens e segregação de permissões para reduzir riscos.",
            "O titular pode solicitar confirmação de tratamento, acesso, correção, portabilidade, anonimização, bloqueio, eliminação, informação de compartilhamento, revogação de consentimento e oposição, conforme a LGPD.",
            "Solicitações devem ser enviadas para privacidade@elisalima.com.br. A resposta seguirá os prazos legais e poderá exigir confirmação de identidade.",
          ],
        },
      ],
      sources: [
        { label: "Mercado Livre Developers - Termos e Condições de Uso", href: "https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes" },
        { label: "Mercado Livre - Central de Privacidade", href: "https://www.mercadolivre.com.br/privacidade" },
        { label: "TikTok Shop - Data security and privacy review", href: "https://partner.tiktokshop.com/docv2/page/data-security-and-privacy-review" },
        { label: "TikTok Shop - App development process", href: "https://partner.tiktokshop.com/docv2/page/65b351a8c8448002e03949a9" },
        { label: "Shopee Open Platform - Data Protection Policy", href: "https://open.shopee.com/developer-guide/32" },
        { label: "Shopee Open Platform - Requesting Access to Sensitive Data", href: "https://open.shopee.com/developer-guide/718" },
        { label: "Shopee Open Platform - Platform Partner Rules", href: "https://open.shopee.com/developer-guide/34" },
      ],
      contact: {
        title: "Privacidade e solicitações",
        emailLabel: "E-mail",
        email: "privacidade@elisalima.com.br",
        addressLabel: "Endereço",
        address: "São Paulo - SP, Brasil",
        companyLabel: "CNPJ",
        company: operatorCompanyPt,
      },
    },
  },
  en: {
    terms: {
      kind: "terms",
      locale: "en",
      title: "Terms of Service",
      metadataTitle: "Terms of Service - Elisa Lima CRM",
      description:
        "Rules for using Elisa Lima CRM, including Mercado Livre, TikTok Shop and Shopee integrations for catalog, orders, support and metrics.",
      lastUpdated: updatedEn,
      alternateHref: "/termos",
      alternateLabel: "Português",
      commitments: [
        "Restricted use by authorized users of KARZI, WUWU and ARMARINHOS LIMA.",
        "No external action is performed without user authorization or an auditable operational rule.",
        "Mercado Livre, TikTok Shop and Shopee data is used only to develop, operate and maintain CRM integrations.",
      ],
      sections: [
        {
          id: "service",
          title: "Service and access",
          eyebrow: "Contract basis",
          icon: "file",
          summary: "The CRM is a private corporate tool for commerce operations and customer support.",
          body: [
            "Elisa Lima CRM consolidates customers, orders, products, inventory, ads, messages, reviews, metrics and operational routines for KARZI, WUWU and ARMARINHOS LIMA.",
            "Access is individual, non-transferable and granted by the operator. Users must keep credentials confidential and report suspected unauthorized access.",
            "The platform is not a public storefront. It organizes operational data received from marketplaces, sales channels and connected tools.",
          ],
          bullets: [
            "Accounts may be suspended for breach, end of relationship or security risk.",
            "Audit logs may record relevant actions for fraud prevention and traceability.",
            "Continued use after updates means acknowledgement of the current version.",
          ],
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          eyebrow: "Operating rules",
          icon: "badge",
          summary: "Users must operate the CRM lawfully, safely and consistently with connected platform rules.",
          body: [
            "Users must not use the CRM for unlawful, misleading, offensive, discriminatory, fraudulent, invasive or rights-infringing purposes.",
            "Users must not share credentials, extract data in bulk outside intended features, bypass technical limits, publish content without proper review or use customer data for purposes incompatible with the brands' operations.",
          ],
          bullets: [
            "Objectionable content or reports may be sent to contato@elisalima.com.br.",
            "Reports are reviewed with operational priority, with removal or blocking when a violation is confirmed.",
            "Features may be limited if a third-party platform changes rules, permissions or availability.",
          ],
        },
        {
          id: "mercado-livre",
          title: "Mercado Livre integration",
          eyebrow: "API and scopes",
          icon: "store",
          summary: "The integration uses Mercado Livre's official API, with per-account OAuth authorization and scopes limited to the contracted operation.",
          body: [
            "Connecting Mercado Livre depends on OAuth authorization granted by the seller and the scopes approved for the app. The CRM requests only the permissions needed to operate catalog, orders, messages, reputation and metrics.",
            "Data obtained through the Mercado Livre API is used only to develop, operate and maintain the CRM features authorized by the connected account. It is not sold, transferred to data brokers or used to train AI models.",
            "Use of the integration is also subject to Mercado Livre's API Terms and Conditions and data protection policies, including security requirements for partner applications.",
          ],
          table: [
            { label: "Account and shop", value: "Connected seller identity", detail: "Shows operators which Mercado Livre account is authorized before actions." },
            { label: "Orders and catalog", value: "Operational sync", detail: "Supports orders, listings, inventory, status, support, reconciliation and reports." },
            { label: "Reputation and metrics", value: "Performance indicators", detail: "Tracks reputation, reviews and metrics for internal management, with no external or advertising use." },
          ],
        },
        {
          id: "tiktok-shop",
          title: "TikTok Shop integration",
          eyebrow: "API and review",
          icon: "shop",
          summary: "The integration uses permissions needed for authorized catalog, orders, content, ads and metrics workflows.",
          body: [
            "Connecting TikTok Shop depends on the official authorization flow and the scopes approved for the app. The CRM requests only permissions needed for contracted features.",
            "When publishing, content changes or protected data are involved, the CRM preserves human review, traceability and operational purpose. API data is not sold, transferred to data brokers or used to train AI models.",
            "Use of the integration is also subject to TikTok Shop terms, privacy policies, content rules, review requirements and security controls.",
          ],
          table: [
            { label: "Account and shop", value: "Connected account identity", detail: "Shows operators which shop or profile is authorized before actions." },
            { label: "Orders and catalog", value: "Operational sync", detail: "Supports orders, products, inventory, status, support, reconciliation and reports." },
            { label: "Content and metrics", value: "Review and performance", detail: "Supports reviewed publishing, metrics reading and internal campaign monitoring." },
          ],
        },
        {
          id: "shopee",
          title: "Shopee integration",
          eyebrow: "Open Platform",
          icon: "store",
          summary: "Shopee marketplace data is processed only as an operational intermediary.",
          body: [
            "Shopee Open Platform is used to develop, operate and maintain shop, product, order, logistics, support, marketing and messaging features when authorized by the shop account.",
            "For personal data obtained from or derived from Shopee Content, the CRM acts as an operational intermediary between the authorized shop and the platform, processing data only for application purposes, Shopee instructions and applicable law.",
            "Protected data such as name, phone number, address and order information is limited to authorized users, necessary screens and support, shipping, audit and legal workflows.",
          ],
          table: [
            { label: "Orders", value: "Customer, items, payment and delivery", detail: "Used for fulfillment, support, status updates and commercial history." },
            { label: "Products", value: "SKU, listing, inventory and price", detail: "Used to keep catalog synchronized and reduce operational divergence." },
            { label: "Support", value: "Messages and requests", detail: "Used to answer buyers, handle post-sale workflows and retain service traceability." },
          ],
        },
        {
          id: "limits",
          title: "Security, third parties and termination",
          eyebrow: "Limits",
          icon: "shield",
          summary: "The CRM protects the operation, but depends on external services and granted permissions.",
          body: [
            "The operator uses reasonable security measures, access control, audit, traffic encryption and protected storage for secrets and tokens.",
            "Integration availability depends on third-party platforms, their environments, policies, approvals and API limits. The CRM may be partly or fully unavailable during maintenance, blocking, authorization expiry or external failure.",
            "Users may request account closure or integration revocation. The operator may end access for breach, legal obligation, security risk or end of operational relationship.",
          ],
        },
      ],
      sources: [
        { label: "Mercado Livre Developers - Terms and Conditions", href: "https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes" },
        { label: "Mercado Livre - Privacy Center", href: "https://www.mercadolivre.com.br/privacidade" },
        { label: "TikTok Shop - Developer Terms of Service", href: "https://partner.tiktokshop.com/docv2/page/6506bc942f024f02be400315" },
        { label: "TikTok Shop - Data security and privacy review", href: "https://partner.tiktokshop.com/docv2/page/data-security-and-privacy-review" },
        { label: "Shopee Open Platform - Terms of Service", href: "https://open.shopee.com/developer-guide/36" },
        { label: "Shopee Open Platform - Data Protection Policy", href: "https://open.shopee.com/developer-guide/32" },
        { label: "Shopee Open Platform - Sensitive Data", href: "https://open.shopee.com/developer-guide/718" },
      ],
      contact: {
        title: "Operator contact",
        emailLabel: "Email",
        email: "contato@elisalima.com.br",
        addressLabel: "Address",
        address: "São Paulo - SP, Brazil",
        companyLabel: "Company registration",
        company: operatorCompanyEn,
      },
    },
    privacy: {
      kind: "privacy",
      locale: "en",
      title: "Privacy Policy",
      metadataTitle: "Privacy Policy - Elisa Lima CRM",
      description:
        "How Elisa Lima CRM collects, uses, protects, retains and deletes personal data in operational integrations with Mercado Livre, TikTok Shop, Shopee and other channels.",
      lastUpdated: updatedEn,
      alternateHref: "/privacidade",
      alternateLabel: "Português",
      commitments: [
        "We do not sell personal data or platform data.",
        "We do not use Mercado Livre, TikTok Shop or Shopee data for external advertising, database enrichment or AI training.",
        "Tokens and protected data are restricted to operational, audit, security and legal purposes.",
      ],
      sections: [
        {
          id: "controller",
          title: "Controller and scope",
          eyebrow: "Privacy law",
          icon: "user",
          summary: "This policy covers internal users, customers, orders and data received through authorized integrations.",
          body: [
            "Elisa Lima CRM processes personal data in accordance with Brazilian LGPD and, where applicable, international data protection rules. The platform is a private corporate tool.",
            "The operator determines the CRM's internal purposes for users, customers and commerce operations. For data obtained from or derived from Shopee Content, the CRM processes such data as an operational intermediary under Shopee Open Platform rules.",
          ],
          bullets: [
            "Privacy contact: privacidade@elisalima.com.br.",
            "The platform is restricted to users aged 18 or older and authorized personnel.",
            "Data subject requests are handled through the channels listed in this policy.",
          ],
        },
        {
          id: "data",
          title: "Data collected",
          eyebrow: "Categories",
          icon: "database",
          summary: "We collect only data needed for authentication, operations, support, integrations and security.",
          body: [
            "User data includes name, email, access role, permissions, activity records, IP address, browser, device and security events.",
            "Customer and order data may include name, phone, email, delivery address, products purchased, payment status, logistics status, support messages, reviews and commercial history.",
            "Integration technical data includes shop identifiers, connected accounts, tokens, sync timestamps, necessary payloads, operational errors and audit logs.",
          ],
          table: [
            { label: "Authentication", value: "User and session", detail: "Enable login, roles, permissions and security." },
            { label: "Commerce operations", value: "Customers, orders and products", detail: "Run support, shipping, stock, reconciliation and metrics." },
            { label: "Integrations", value: "Tokens and identifiers", detail: "Maintain authorized connections and sync routines." },
          ],
        },
        {
          id: "mercado-livre",
          title: "Mercado Livre data",
          eyebrow: "Official API",
          icon: "store",
          summary: "Mercado Livre data is obtained through the official API and used only within scopes authorized by the seller.",
          body: [
            "When an account authorizes the integration via OAuth, the CRM may access data allowed by approved scopes: seller identity, catalog, orders, shipping status, messages, reputation and metrics needed to operate the connection.",
            "Mercado Livre's API does not expose the buyer's phone number or email, so the CRM does not perform or automate direct contact with Mercado Livre order customers outside the messages exchanged through the platform's own official channel.",
            "This data is not sold, licensed, transferred to data brokers, used to train AI models or combined with external datasets to identify people. Revoking authorization invalidates tokens and stops new collection.",
          ],
          bullets: [
            "Reputation and metrics are used only for internal management, never for external advertising.",
            "Order data is available only to authorized roles and to support, shipping and reconciliation workflows.",
            "Secrets and access tokens remain in secure storage, never in source code.",
          ],
        },
        {
          id: "tiktok",
          title: "TikTok Shop data",
          eyebrow: "Limited purpose",
          icon: "shop",
          summary: "TikTok Shop data is used only for authorized features and operational review.",
          body: [
            "When an account authorizes the integration, the CRM may access data allowed by approved scopes: shop or profile identity, catalog, orders, status, content, metrics and information needed to operate the connection.",
            "This data is not sold, licensed, transferred to data brokers, used for targeted advertising outside the platform, used to train AI or combined with external datasets to identify people.",
            "Revoking authorization invalidates tokens and stops new collection. Imported data is deleted, anonymized or retained only when needed for audit, security, support, legal obligation or legal claims.",
          ],
          bullets: [
            "Content should not be published without review and confirmation when the feature requires human action.",
            "Protected data is available only to authorized roles.",
            "Secrets must remain in environment variables or secure storage, never in source code.",
          ],
        },
        {
          id: "shopee",
          title: "Shopee data",
          eyebrow: "Intermediary",
          icon: "store",
          summary: "Shopee data is processed on behalf of the authorized shop and within the approved purpose.",
          body: [
            "Shopee Open Platform protects sellers' business data and personal data considered sensitive, including data such as name, phone number and address. The CRM limits access to this data according to operational need.",
            "For personal data obtained from or derived from Shopee Content, the CRM processes data only to develop, operate and maintain the application, in accordance with Shopee terms, applicable instructions and privacy law.",
            "The CRM does not use Shopee data for incompatible own purposes, external advertising, data brokerage, data enrichment, scraping or AI training.",
          ],
          table: [
            { label: "Retention", value: "As long as needed", detail: "Orders and logs follow tax, civil, support, security and audit periods." },
            { label: "Access", value: "Least privilege", detail: "Only authorized roles can view buyer, delivery and support data." },
            { label: "Deletion", value: "Revocation or request", detail: "Tokens are invalidated and data is removed or anonymized where applicable." },
          ],
        },
        {
          id: "rights",
          title: "Security, rights and contact",
          eyebrow: "Governance",
          icon: "lock",
          summary: "Data subjects may request access, correction, objection, revocation and deletion under applicable law.",
          body: [
            "The platform uses HTTPS, role-based access control, audit logs, backups, token protection and permission segregation to reduce risk.",
            "Data subjects may request confirmation, access, correction, portability, anonymization, blocking, deletion, sharing information, consent withdrawal and objection, as provided by the LGPD.",
            "Requests should be sent to privacidade@elisalima.com.br. Responses follow legal deadlines and may require identity verification.",
          ],
        },
      ],
      sources: [
        { label: "Mercado Livre Developers - Terms and Conditions", href: "https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes" },
        { label: "Mercado Livre - Privacy Center", href: "https://www.mercadolivre.com.br/privacidade" },
        { label: "TikTok Shop - Data security and privacy review", href: "https://partner.tiktokshop.com/docv2/page/data-security-and-privacy-review" },
        { label: "TikTok Shop - App development process", href: "https://partner.tiktokshop.com/docv2/page/65b351a8c8448002e03949a9" },
        { label: "Shopee Open Platform - Data Protection Policy", href: "https://open.shopee.com/developer-guide/32" },
        { label: "Shopee Open Platform - Requesting Access to Sensitive Data", href: "https://open.shopee.com/developer-guide/718" },
        { label: "Shopee Open Platform - Platform Partner Rules", href: "https://open.shopee.com/developer-guide/34" },
      ],
      contact: {
        title: "Privacy and requests",
        emailLabel: "Email",
        email: "privacidade@elisalima.com.br",
        addressLabel: "Address",
        address: "São Paulo - SP, Brazil",
        companyLabel: "Company registration",
        company: operatorCompanyEn,
      },
    },
  },
} satisfies Record<LegalLocale, Record<LegalDocumentKind, LegalDocument>>;

export function getLegalDocument(locale: LegalLocale, kind: LegalDocumentKind) {
  return legalDocuments[locale][kind];
}

export const legalLoginItems = [
  {
    href: "/termos",
    title: "Termos",
    description: "Regras de uso e integrações Mercado Livre/TikTok Shop/Shopee",
    icon: Handshake,
  },
  {
    href: "/privacidade",
    title: "Privacidade",
    description: "Dados, retenção, revogação e direitos LGPD",
    icon: Boxes,
  },
] as const;
