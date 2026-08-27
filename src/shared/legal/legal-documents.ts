import { Boxes, Handshake, ShieldCheck } from "lucide-react";

export type LegalLocale = "pt" | "en";
export type LegalDocumentKind = "terms" | "privacy" | "security";

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
// Privacidade ganhou data própria em 27/08/2026: o texto de exclusão ao fim
// da relação foi reescrito naquele dia, e a data era compartilhada com os
// Termos — bumpar a constante comum afirmaria que os Termos também mudaram,
// o que não aconteceu. Documento que muda sozinho precisa de data sozinha.
const updatedPrivacyPt = "Atualizado em 27 de agosto de 2026";
const updatedPrivacyEn = "Last updated on August 27, 2026";
// A página de segurança nasceu depois de Termos e Privacidade e passa a ter
// data própria: ela é revisada quando um controle técnico muda, não quando o
// texto legal muda, então as duas datas andam separadas de propósito.
const updatedSecurityPt = "Atualizado em 27 de agosto de 2026";
const updatedSecurityEn = "Last updated on August 27, 2026";
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
            "A plataforma não é uma loja aberta ao público. Ela organiza dados operacionais recebidos de canais de venda e ferramentas conectadas.",
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
            "É proibido usar o CRM para finalidade ilícita, enganosa, ofensiva, discriminatória, fraudulenta, invasiva ou que viole direitos de propriedade intelectual, privacidade ou regras dos canais de venda.",
            "Também é proibido compartilhar credenciais, extrair dados em massa fora das funções previstas, tentar burlar limites técnicos, publicar conteúdo sem revisão adequada ou usar dados de clientes para finalidade incompatível com a operação das marcas.",
          ],
          bullets: [
            "Conteúdos abusivos ou denúncias podem ser enviados para producao@elisalima.com.br.",
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
          summary: "A integração Shopee trata os dados do canal de venda apenas como intermediária operacional.",
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
        email: "producao@elisalima.com.br",
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
      lastUpdated: updatedPrivacyPt,
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
            "Contato de privacidade: producao@elisalima.com.br.",
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
            "Solicitações devem ser enviadas para producao@elisalima.com.br. A resposta seguirá os prazos legais e poderá exigir confirmação de identidade.",
          ],
        },
        {
          id: "compromissos-plataforma",
          title: "Compromissos com plataformas e vendedores",
          eyebrow: "Operador",
          icon: "shield",
          summary: "Apoio a solicitações de titulares, exclusão ao fim da relação e aviso de incidente de segurança.",
          body: [
            "Atendimento a solicitações: quando um titular exerce um direito diretamente com a plataforma (TikTok Shop, Shopee, Mercado Livre) ou com o vendedor autorizado, e a solicitação é encaminhada ao Elisa Lima CRM, a operadora atende ao pedido de acesso, correção, atualização, portabilidade, anonimização ou exclusão dos dados daquele titular em até 15 dias corridos do recebimento, e confirma por escrito a quem encaminhou. O mesmo canal vale para pedidos vindos da própria plataforma.",
            "Encerramento da relação: encerrado o contrato, revogada a autorização ou desconectada a conta de canal, os tokens são invalidados imediatamente e a coleta cessa na mesma hora. A exclusão dos dados já coletados daquele canal é executada mediante solicitação da plataforma ou do vendedor autorizado, sem demora injustificada. A execução é sempre manual e nunca automática: exige autorização de três administradores distintos, cada um confirmando com a própria credencial, controle deliberado para que uma credencial comprometida ou um comando equivocado não destrua histórico de forma irreversível. Cada execução é registrada em log de auditoria com data, responsáveis e volume afetado, e esse registro é fornecido por escrito a quem solicitar. Só permanece o mínimo que a lei obrigue reter (por exemplo, dados fiscais de pedidos), sem uso operacional.",
            "Incidente de segurança: confirmado um acesso não autorizado, perda, alteração indevida ou vazamento que envolva dados pessoais ou dados de conta obtidos das plataformas, a operadora comunica a plataforma afetada e os vendedores afetados em até 72 horas da confirmação, pelo canal oficial de suporte ao desenvolvedor e por producao@elisalima.com.br, informando natureza do incidente, dados e titulares envolvidos, medidas técnicas já tomadas e plano de correção, com atualizações até o encerramento. A comunicação à ANPD e aos titulares segue a LGPD.",
          ],
          // `bullets`, não `table`: este documento não renderiza `table` (as
          // tabelas das seções Shopee e Mercado Livre também não aparecem na
          // página). Os prazos precisam ficar visíveis — é o que o avaliador
          // de plataforma procura primeiro.
          bullets: [
            "Solicitação de titular encaminhada pela plataforma ou pelo vendedor: atendida em até 15 dias corridos.",
            "Fim da relação, revogação ou desconexão: tokens invalidados na hora; exclusão dos dados executada mediante solicitação, sem demora injustificada, sob autorização de três administradores distintos.",
            "Incidente de segurança confirmado: plataforma e vendedores afetados avisados em até 72 horas.",
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
        email: "producao@elisalima.com.br",
        addressLabel: "Endereço",
        address: "São Paulo - SP, Brasil",
        companyLabel: "CNPJ",
        company: operatorCompanyPt,
      },
    },
    security: {
      kind: "security",
      locale: "pt",
      title: "Segurança da Informação",
      metadataTitle: "Segurança da Informação - Elisa Lima CRM",
      description:
        "Controles de segurança, classificação e retenção de dados, gestão de vulnerabilidades e resposta a incidentes do Elisa Lima CRM.",
      lastUpdated: updatedSecurityPt,
      alternateHref: "/security",
      alternateLabel: "English",
      commitments: [
        "Acesso por menor privilégio: perfil, rota e módulo são concedidos individualmente, e todo dado é isolado por organização no banco.",
        "Criptografia obrigatória em trânsito (HTTPS com HSTS) e em repouso (AES-256 no banco gerenciado).",
        "Incidente confirmado é comunicado às plataformas e aos vendedores afetados em até 72 horas.",
      ],
      sections: [
        {
          id: "escopo",
          title: "Escopo e arquitetura",
          eyebrow: "Superfície",
          icon: "file",
          summary: "Aplicação serverless, sem servidores próprios e sem rede corporativa exposta.",
          body: [
            "O Elisa Lima CRM é uma aplicação web privada, usada pelas marcas KARZI, WUWU e ARMARINHOS LIMA para operar catálogo, pedidos, estoque, anúncios, atendimento e métricas a partir das integrações autorizadas de Mercado Livre, TikTok Shop e Shopee.",
            "A aplicação roda em infraestrutura gerenciada, com WAF e proteção contra negação de serviço da plataforma de hospedagem e TLS terminado na borda. Não há servidor administrado pela operadora, não há rede corporativa própria e não existem portas de entrada abertas para a internet.",
            "O banco de dados é um PostgreSQL gerenciado, alcançável apenas pelo pooler de conexão mediante credencial. As credenciais vivem em variáveis de ambiente do provedor de hospedagem, nunca no código-fonte e nunca entregues ao navegador.",
          ],
          bullets: [
            "As chamadas de saída para as APIs dos canais partem de um endereço IP de egresso fixo e declarado às plataformas.",
            "Nenhum segredo vive no código: credenciais e tokens ficam exclusivamente em variáveis de ambiente. O repositório tem varredura automática e contínua de segredo, com bloqueio de envio que impede uma credencial de entrar no histórico.",
            "Ambientes de desenvolvimento e produção usam credenciais distintas.",
          ],
        },
        {
          id: "acesso",
          title: "Controle de acesso e menor privilégio",
          eyebrow: "Autorização",
          icon: "user",
          summary: "Perfil, rota e módulo são concedidos individualmente, e o isolamento entre organizações é validado por teste automatizado.",
          body: [
            "A autenticação usa provedor gerenciado com sessão assinada. A autorização acontece em três camadas somadas: perfil do usuário (administrador, gestor ou vendedor), restrição por rota declarada em configuração versionada, e visibilidade de módulo definida individualmente pelo administrador para cada pessoa.",
            "Toda operação de escrita revalida o perfil de quem chamou no lado do servidor. A verificação nunca depende do que o navegador informa, de modo que ocultar um módulo na interface não é o que protege o dado — a checagem no servidor é.",
            "Os dados são isolados por organização no próprio banco: todas as tabelas têm Row Level Security ativa com política por identificador de organização, e o código filtra explicitamente por esse identificador em cada consulta. Uma suíte de testes dedicada roda na integração contínua a cada alteração e valida negação por padrão, isolamento de leitura e escrita, e bloqueio de troca de organização.",
          ],
          bullets: [
            "A chave privilegiada do banco é usada somente em código de servidor e jamais é enviada ao cliente.",
            "Os escopos solicitados nas APIs dos canais se limitam ao necessário para a funcionalidade autorizada.",
            "Ações sensíveis ficam registradas em log de auditoria somente de inserção, que não é atualizado nem apagado.",
            "Contas de usuário são criadas e desativadas pelo administrador, e o desligamento revoga o acesso imediatamente.",
          ],
        },
        {
          id: "criptografia",
          title: "Criptografia e proteção do tráfego",
          eyebrow: "Confidencialidade",
          icon: "lock",
          summary: "HTTPS obrigatório com HSTS e política de conteúdo restritiva; dados em repouso cifrados com AES-256.",
          body: [
            "Todo o tráfego é exclusivamente HTTPS. A resposta carrega Strict-Transport-Security com validade de dois anos, incluindo subdomínios e com preload, o que impede rebaixamento para HTTP mesmo em primeira visita conhecida.",
            "Uma Content-Security-Policy restritiva limita as origens de script, imagem, fonte, estilo e conexão a um conjunto declarado. Somam-se a ela negação de enquadramento, X-Content-Type-Options nosniff, Referrer-Policy de origem estrita e Permissions-Policy negando câmera, microfone e geolocalização.",
            "Os dados em repouso ficam em PostgreSQL gerenciado com criptografia de disco AES-256 aplicada pelo provedor, com backups igualmente cifrados. Credenciais e tokens de integração são guardados apartados dos dados operacionais.",
          ],
          bullets: [
            "Nenhum segredo é versionado; todos vivem em variáveis de ambiente.",
            "Tokens de acesso das plataformas são renovados automaticamente e invalidados na desconexão da conta.",
            "Os cabeçalhos de segurança são verificáveis publicamente por qualquer ferramenta de varredura.",
          ],
        },
        {
          id: "classificacao",
          title: "Classificação e retenção de dados",
          eyebrow: "Governança do dado",
          icon: "database",
          summary: "Quatro categorias de dado, cada uma com origem, finalidade e prazo de retenção declarados.",
          body: [
            "A operadora trata apenas o dado que as plataformas entregam para o cumprimento do pedido e para a operação do catálogo. Não há coleta direta de titular, não há enriquecimento com bases externas, não há corretagem de dados e nenhum dado de plataforma é usado para treinar modelos de inteligência artificial.",
            "Cada categoria abaixo recebe tratamento proporcional à sua sensibilidade. Dado pessoal e segredo têm acesso restrito aos perfis que precisam deles para operar, e o acesso é registrado em auditoria.",
          ],
          table: [
            { label: "Segredo", value: "Segredo", detail: "Credenciais de aplicativo e tokens OAuth das plataformas. Acesso somente por código de servidor. Retidos enquanto a conexão existir e invalidados imediatamente na desconexão." },
            { label: "Pessoal", value: "Pessoal", detail: "Nome, endereço de entrega e contato do comprador, quando a plataforma os fornece. Usados apenas para cumprir e acompanhar o pedido. Retidos pelo prazo fiscal e legal aplicável ao pedido." },
            { label: "Comercial", value: "Comercial", detail: "Pedidos, itens, valores, catálogo, estoque, anúncios e métricas do vendedor. Usados para operar e analisar a própria loja. Retidos enquanto a relação existir." },
            { label: "Operacional", value: "Operacional", detail: "Logs de execução, auditoria e saúde das integrações. Usados para suporte, segurança e rastreabilidade. Retidos por período limitado e sem finalidade comercial." },
          ],
          bullets: [
            "Encerrada a relação, revogada a autorização ou desconectada a conta, os tokens são invalidados na hora e a coleta cessa; a exclusão dos dados daquele canal é executada mediante solicitação, sem demora injustificada.",
            "A exclusão nunca é automática: exige autorização de três administradores distintos e fica registrada em log de auditoria com data, responsáveis e volume afetado.",
            "Permanece somente o mínimo que a lei obriga reter, sem uso operacional, informado por escrito quando solicitado.",
            "Dados de plataforma não são vendidos, licenciados nem transferidos a terceiros.",
          ],
        },
        {
          id: "vulnerabilidades",
          title: "Gestão de vulnerabilidades",
          eyebrow: "Prevenção",
          icon: "shield",
          summary: "Varredura contínua de dependências, verificação automatizada a cada alteração e teste de intrusão periódico.",
          body: [
            "As dependências do projeto são monitoradas continuamente por varredura automática, que emite alerta e abre solicitação de atualização assim que uma vulnerabilidade conhecida é publicada. Correções de severidade alta são priorizadas sobre trabalho de funcionalidade.",
            "Toda alteração de código passa por integração contínua antes de chegar à produção: análise estática, verificação de tipos e bateria de testes automatizados, incluindo a suíte que valida o isolamento entre organizações na camada do banco. Alteração que quebra a verificação não é publicada.",
            "A aplicação passou por teste de intrusão em agosto de 2026, cobrindo autenticação, autorização, isolamento entre organizações, exposição de segredo e superfície de API. Os achados foram corrigidos e reverificados. O relatório é fornecido a plataformas parceiras mediante solicitação.",
          ],
          bullets: [
            "Correção de vulnerabilidade crítica ou alta: tratada com prioridade sobre demanda de funcionalidade.",
            "A verificação automatizada — tipos, análise estática, testes unitários, testes de isolamento de dados e build — roda a cada envio de código, e o resultado é revisado antes de a alteração ser considerada concluída.",
            "As dependências publicadas em produção são mantidas sem vulnerabilidade conhecida em aberto.",
            "Achados de segurança relatados por terceiros podem ser enviados para producao@elisalima.com.br.",
          ],
        },
        {
          id: "incidentes",
          title: "Resposta a incidentes",
          eyebrow: "Reação",
          icon: "badge",
          summary: "Responsável nomeado, prazo de 72 horas e conteúdo mínimo da comunicação definidos previamente.",
          body: [
            "A responsabilidade pela resposta a incidentes é do líder de operações, alcançável em producao@elisalima.com.br, que conduz a contenção, decide a comunicação e acompanha a correção até o encerramento.",
            "Confirmado um acesso não autorizado, perda, alteração indevida ou vazamento que envolva dados pessoais ou dados de conta obtidos das plataformas, a operadora comunica a plataforma afetada e os vendedores afetados em até 72 horas da confirmação, pelo canal oficial de suporte ao desenvolvedor e por e-mail.",
            "A comunicação informa a natureza do incidente, os dados e titulares envolvidos, as medidas técnicas já tomadas e o plano de correção, e é seguida de atualizações até o encerramento. A notificação à Autoridade Nacional de Proteção de Dados e aos titulares segue a LGPD.",
          ],
          bullets: [
            "Primeira ação de contenção: revogar tokens e sessões da superfície afetada.",
            "Prazo de comunicação: até 72 horas da confirmação do incidente.",
            "O log de auditoria somente de inserção sustenta a reconstituição do que ocorreu.",
          ],
        },
        {
          id: "titulares",
          title: "Direitos do titular e exclusão",
          eyebrow: "Titulares",
          icon: "shield",
          summary: "Solicitação encaminhada pela plataforma ou pelo vendedor é atendida em até 15 dias corridos.",
          body: [
            "Quando um titular exerce um direito diretamente com a plataforma ou com o vendedor autorizado e a solicitação é encaminhada à operadora, o pedido de acesso, correção, atualização, portabilidade, anonimização ou exclusão é atendido em até 15 dias corridos do recebimento, com confirmação por escrito a quem encaminhou.",
            "O mesmo canal e o mesmo prazo valem para pedidos vindos diretamente da plataforma. A operadora pode solicitar confirmação de identidade antes de executar, para não atender pedido fraudulento em nome de terceiro.",
            "Encerrada a relação contratual, revogada a autorização ou desconectada a conta de canal, os tokens são invalidados imediatamente e a coleta cessa na mesma hora. A exclusão dos dados já coletados daquele canal é executada mediante solicitação, sem demora injustificada, sempre por operação manual autorizada por três administradores distintos e registrada em log de auditoria.",
          ],
          bullets: [
            "Solicitação de titular: atendida em até 15 dias corridos.",
            "Fim da relação, revogação ou desconexão: tokens invalidados na hora; exclusão executada mediante solicitação, sob autorização de três administradores distintos.",
            "Canal único para os dois casos: producao@elisalima.com.br.",
          ],
        },
        {
          id: "responsabilidade",
          title: "Responsável e revisão",
          eyebrow: "Manutenção",
          icon: "user",
          summary: "Documento revisado sempre que uma integração, um controle ou um prazo muda.",
          body: [
            "Esta página descreve os controles efetivamente em vigor, não uma intenção futura. É revisada sempre que uma integração é adicionada ou removida, um controle técnico muda, ou um prazo declarado é alterado.",
            "A operadora é uma equipe pequena e não mantém certificação ISO 27001 nem SOC 2. Os controles aqui descritos são verificáveis por inspeção técnica: os cabeçalhos de segurança podem ser conferidos por varredura pública, e o comportamento de isolamento e autorização é coberto por teste automatizado executado a cada alteração.",
            "Dúvidas de plataformas parceiras, de vendedores autorizados ou de titulares devem ser enviadas para producao@elisalima.com.br.",
          ],
        },
      ],
      sources: [
        { label: "TikTok Shop - Data security and privacy review", href: "https://partner.tiktokshop.com/docv2/page/data-security-and-privacy-review" },
        { label: "Shopee Open Platform - Data Protection Policy", href: "https://open.shopee.com/developer-guide/32" },
        { label: "Mercado Livre Developers - Termos e Condições de Uso", href: "https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes" },
        { label: "Lei Geral de Proteção de Dados - Lei 13.709/2018", href: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" },
      ],
      contact: {
        title: "Segurança e incidentes",
        emailLabel: "E-mail",
        email: "producao@elisalima.com.br",
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
            "Objectionable content or reports may be sent to producao@elisalima.com.br.",
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
        email: "producao@elisalima.com.br",
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
      lastUpdated: updatedPrivacyEn,
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
            "Privacy contact: producao@elisalima.com.br.",
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
            "Requests should be sent to producao@elisalima.com.br. Responses follow legal deadlines and may require identity verification.",
          ],
        },
        {
          id: "platform-commitments",
          title: "Commitments to platforms and sellers",
          eyebrow: "Processor",
          icon: "shield",
          summary: "Support for user requests, deletion at the end of the relationship and security incident notification.",
          body: [
            "Support for user requests: when a data subject exercises a right directly with the platform (TikTok Shop, Shopee, Mercado Livre) or with the authorized seller, and the request is forwarded to Elisa Lima CRM, the operator fulfils the request to access, correct, update, port, anonymize or delete that data subject's data within 15 calendar days of receipt, and confirms completion in writing to whoever forwarded it. The same channel applies to requests raised by the platform itself.",
            "End of the relationship: upon contract termination, revocation of authorization or disconnection of a channel account, tokens are invalidated immediately and collection stops at once. Deletion of the data already collected from that channel is carried out upon request from the platform or the authorized seller, without undue delay. Execution is always manual and never automated: it requires authorization from three distinct administrators, each confirming with their own credential — a deliberate control so that a compromised credential or a mistaken command cannot irreversibly destroy history. Every execution is recorded in an audit log with the date, the responsible administrators and the volume affected, and that record is provided in writing on request. Only the minimum that law requires is kept (for example, tax records of orders), with no operational use.",
            "Security incident: once unauthorized access, loss, improper alteration or leakage involving personal data or platform account data is confirmed, the operator notifies the affected platform and the affected sellers within 72 hours of confirmation, through the official developer support channel and producao@elisalima.com.br, describing the nature of the incident, the data and data subjects involved, technical measures already taken and the remediation plan, with updates until closure. Notification to the Brazilian ANPD and to data subjects follows the LGPD.",
          ],
          // See the note on the Portuguese section: this document renders
          // `bullets`, not `table`.
          bullets: [
            "User request forwarded by the platform or the seller: fulfilled within 15 calendar days.",
            "End of relationship, revocation or disconnection: tokens invalidated immediately; deletion carried out upon request, without undue delay, under authorization from three distinct administrators.",
            "Confirmed security incident: affected platform and sellers notified within 72 hours.",
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
        email: "producao@elisalima.com.br",
        addressLabel: "Address",
        address: "São Paulo - SP, Brazil",
        companyLabel: "Company registration",
        company: operatorCompanyEn,
      },
    },
    security: {
      kind: "security",
      locale: "en",
      title: "Information Security",
      metadataTitle: "Information Security - Elisa Lima CRM",
      description:
        "Security controls, data classification and retention, vulnerability management and incident response for Elisa Lima CRM.",
      lastUpdated: updatedSecurityEn,
      alternateHref: "/seguranca",
      alternateLabel: "Português",
      commitments: [
        "Least privilege access: profile, route and module are granted individually, and all data is tenant-isolated at the database level.",
        "Encryption is mandatory in transit (HTTPS with HSTS) and at rest (AES-256 on managed database storage).",
        "A confirmed incident is reported to the affected platforms and sellers within 72 hours.",
      ],
      sections: [
        {
          id: "scope",
          title: "Scope and architecture",
          eyebrow: "Attack surface",
          icon: "file",
          summary: "A serverless application, with no self-managed servers and no exposed corporate network.",
          body: [
            "Elisa Lima CRM is a private web application used by the brands KARZI, WUWU and ARMARINHOS LIMA to operate catalog, orders, inventory, ads, customer support and metrics from authorized Mercado Livre, TikTok Shop and Shopee integrations.",
            "The application runs on managed infrastructure, with the hosting platform's managed WAF and denial-of-service protection and TLS terminated at the edge. The operator administers no servers, maintains no corporate network of its own, and exposes no inbound ports to the internet.",
            "The database is a managed PostgreSQL instance, reachable only through the connection pooler with credentials. Credentials live in hosting provider environment variables, never in source control and never delivered to the browser.",
          ],
          bullets: [
            "Outbound calls to channel APIs leave from a fixed egress IP address declared to the platforms.",
            "No secret lives in code: credentials and tokens are held exclusively in environment variables. The repository runs continuous automated secret scanning, with push protection that prevents a credential from entering the history.",
            "Development and production environments use separate credentials.",
          ],
        },
        {
          id: "access",
          title: "Access control and least privilege",
          eyebrow: "Authorization",
          icon: "user",
          summary: "Profile, route and module are granted individually, and tenant isolation is verified by an automated test suite.",
          body: [
            "Authentication uses a managed provider with a signed session. Authorization is enforced in three cumulative layers: user profile (admin, manager or seller), per-route restriction declared in versioned configuration, and module visibility set individually by the administrator for each person.",
            "Every write operation re-validates the caller's profile server-side. The check never relies on what the browser reports, so hiding a module in the interface is not what protects the data — the server-side check is.",
            "Data is tenant-isolated in the database itself: every table has Row Level Security enabled with an organization identifier policy, and application code filters explicitly by that identifier on every query. A dedicated test suite runs in continuous integration on every change and verifies default deny, read and write isolation, and blocking of tenant switching.",
          ],
          bullets: [
            "The privileged database key is used only in server-side code and is never shipped to the client.",
            "Scopes requested from channel APIs are limited to what the authorized functionality requires.",
            "Sensitive actions are recorded in an insert-only audit log that is never updated or deleted.",
            "User accounts are created and deactivated by the administrator, and offboarding revokes access immediately.",
          ],
        },
        {
          id: "encryption",
          title: "Encryption and traffic protection",
          eyebrow: "Confidentiality",
          icon: "lock",
          summary: "HTTPS is mandatory with HSTS and a restrictive content policy; data at rest is encrypted with AES-256.",
          body: [
            "All traffic is HTTPS only. Responses carry Strict-Transport-Security with a two-year max-age, includeSubDomains and preload, which prevents downgrade to HTTP even on a known first visit.",
            "A restrictive Content-Security-Policy limits script, image, font, style and connection origins to a declared set. It is complemented by frame denial, X-Content-Type-Options nosniff, a strict-origin Referrer-Policy, and a Permissions-Policy denying camera, microphone and geolocation.",
            "Data at rest is held in managed PostgreSQL with provider-applied AES-256 disk encryption, and backups are encrypted as well. Integration credentials and tokens are stored separately from operational data.",
          ],
          bullets: [
            "No secret is committed to source control; all secrets live in environment variables.",
            "Platform access tokens are refreshed automatically and invalidated when an account is disconnected.",
            "Security headers are publicly verifiable with any scanning tool.",
          ],
        },
        {
          id: "classification",
          title: "Data classification and retention",
          eyebrow: "Data governance",
          icon: "database",
          summary: "Four data categories, each with a declared origin, purpose and retention period.",
          body: [
            "The operator processes only the data platforms provide for order fulfilment and catalog operation. There is no direct collection from data subjects, no enrichment with external databases, no data brokerage, and no platform data is used to train artificial intelligence models.",
            "Each category below is handled in proportion to its sensitivity. Personal data and secrets are restricted to the profiles that need them to operate, and access is recorded in the audit log.",
          ],
          table: [
            { label: "Secret", value: "Secret", detail: "Application credentials and platform OAuth tokens. Accessible only to server-side code. Retained while the connection exists and invalidated immediately on disconnection." },
            { label: "Personal", value: "Personal", detail: "Buyer name, delivery address and contact, where the platform provides them. Used only to fulfil and track the order. Retained for the tax and legal period applicable to the order." },
            { label: "Commercial", value: "Commercial", detail: "Orders, items, amounts, catalog, inventory, ads and seller metrics. Used to operate and analyse the seller's own store. Retained while the relationship exists." },
            { label: "Operational", value: "Operational", detail: "Execution logs, audit records and integration health. Used for support, security and traceability. Retained for a limited period and with no commercial purpose." },
          ],
          bullets: [
            "On termination, revocation of authorization or account disconnection, tokens are invalidated immediately and collection stops; that channel's data is deleted upon request, without undue delay.",
            "Deletion is never automated: it requires authorization from three distinct administrators and is recorded in an audit log with the date, the responsible administrators and the volume affected.",
            "Only the minimum that law requires is retained, with no operational use, disclosed in writing on request.",
            "Platform data is never sold, licensed or transferred to third parties.",
          ],
        },
        {
          id: "vulnerabilities",
          title: "Vulnerability management",
          eyebrow: "Prevention",
          icon: "shield",
          summary: "Continuous dependency scanning, automated verification on every change, and periodic penetration testing.",
          body: [
            "Project dependencies are monitored continuously by automated scanning, which raises an alert and opens an update request as soon as a known vulnerability is published. High severity fixes take priority over feature work.",
            "Every code change passes through continuous integration before reaching production: static analysis, type checking and an automated test battery, including the suite that verifies database-level tenant isolation. A change that fails verification is not published.",
            "The application underwent penetration testing in August 2026, covering authentication, authorization, tenant isolation, secret exposure and API surface. Findings were remediated and re-verified. The report is provided to partner platforms on request.",
          ],
          bullets: [
            "Critical or high severity fixes take priority over feature demand.",
            "Automated verification — type checking, static analysis, unit tests, data isolation tests and build — runs on every code push, and its result is reviewed before a change is considered complete.",
            "Dependencies deployed to production are kept free of known open vulnerabilities.",
            "Third-party security findings can be sent to producao@elisalima.com.br.",
          ],
        },
        {
          id: "incidents",
          title: "Incident response",
          eyebrow: "Reaction",
          icon: "badge",
          summary: "A named responsible person, a 72-hour deadline and a predefined minimum notification content.",
          body: [
            "Responsibility for incident response sits with the operations lead, reachable at producao@elisalima.com.br, who directs containment, decides on notification and follows remediation through to closure.",
            "On confirmation of unauthorized access, loss, tampering or leakage involving personal data or account data obtained from the platforms, the operator notifies the affected platform and the affected sellers within 72 hours of confirmation, through the official developer support channel and by email.",
            "The notification states the nature of the incident, the data and data subjects involved, the technical measures already taken and the remediation plan, and is followed by updates until closure. Notification to the Brazilian data protection authority (ANPD) and to data subjects follows the LGPD.",
          ],
          bullets: [
            "First containment action: revoke tokens and sessions on the affected surface.",
            "Notification deadline: within 72 hours of incident confirmation.",
            "The insert-only audit log supports reconstructing what happened.",
          ],
        },
        {
          id: "subjects",
          title: "Data subject rights and deletion",
          eyebrow: "Data subjects",
          icon: "shield",
          summary: "A request forwarded by the platform or by the seller is fulfilled within 15 calendar days.",
          body: [
            "When a data subject exercises a right directly with the platform or with the authorized seller and the request is forwarded to the operator, the request for access, correction, update, portability, anonymization or deletion is fulfilled within 15 calendar days of receipt, with written confirmation to whoever forwarded it.",
            "The same channel and deadline apply to requests coming directly from the platform. The operator may request identity confirmation before acting, so as not to serve a fraudulent request made in someone else's name.",
            "On contract termination, revocation of authorization or disconnection of a channel account, tokens are invalidated immediately and collection stops at once. Deletion of the data already collected from that channel is carried out upon request, without undue delay, always as a manual operation authorized by three distinct administrators and recorded in an audit log.",
          ],
          bullets: [
            "Data subject request: fulfilled within 15 calendar days.",
            "End of relationship, revocation or disconnection: tokens invalidated immediately; deletion carried out upon request, under authorization from three distinct administrators.",
            "Single channel for both cases: producao@elisalima.com.br.",
          ],
        },
        {
          id: "ownership",
          title: "Ownership and review",
          eyebrow: "Maintenance",
          icon: "user",
          summary: "This document is reviewed whenever an integration, a control or a declared deadline changes.",
          body: [
            "This page describes controls actually in force, not a future intention. It is reviewed whenever an integration is added or removed, a technical control changes, or a declared deadline is altered.",
            "The operator is a small team and does not hold ISO 27001 or SOC 2 certification. The controls described here are verifiable by technical inspection: security headers can be checked with any public scanner, and isolation and authorization behaviour is covered by automated tests executed on every change.",
            "Questions from partner platforms, authorized sellers or data subjects should be sent to producao@elisalima.com.br.",
          ],
        },
      ],
      sources: [
        { label: "TikTok Shop - Data security and privacy review", href: "https://partner.tiktokshop.com/docv2/page/data-security-and-privacy-review" },
        { label: "Shopee Open Platform - Data Protection Policy", href: "https://open.shopee.com/developer-guide/32" },
        { label: "Mercado Livre Developers - Terms and Conditions", href: "https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes" },
        { label: "Brazilian General Data Protection Law - Law 13.709/2018", href: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" },
      ],
      contact: {
        title: "Security and incidents",
        emailLabel: "Email",
        email: "producao@elisalima.com.br",
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
  {
    href: "/seguranca",
    title: "Segurança",
    description: "Controles de acesso, criptografia, incidentes e vulnerabilidades",
    icon: ShieldCheck,
  },
] as const;
