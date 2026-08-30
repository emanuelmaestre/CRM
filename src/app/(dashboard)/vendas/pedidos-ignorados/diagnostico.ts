import { PackageSearch, UserRoundX, Bug, HelpCircle, type LucideIcon } from "lucide-react";
import { mapearStatusPedido } from "@/modules/canais/domain/order-status";
import type { PedidoIgnoradoLinha } from "@/modules/vendas/application/pedidos-ignorados.service";

/* ── O que esta tela precisa saber dizer ──────────────────────────────────
   Três perguntas, e cada uma vive num lugar diferente porque cada uma muda
   num ritmo diferente:

   1. "Por que ISTO acontece?" — a regra da causa, igual para todas as linhas
      dela. Fica no cabeçalho da etapa, uma vez.
   2. "Por que ESTE pedido ficou de fora?" — muda de linha para linha (qual
      SKU, qual comprador, cancelado ou não), e por isso mora no cartão.
   3. "O que eu faço agora?" — o passo a passo. É igual para todos os pedidos
      que compartilham o mesmo SKU ou o mesmo conflito, e é justamente por
      isso que a tela agrupa em TAREFAS: quarenta cartões repetindo os mesmos
      seis passos não é didática, é ruído. Ver `agruparEmTarefas`. */

export type Tom = "voce" | "sozinho" | "nosso" | "neutro";

/** Onde a pendência se resolve — o eixo que realmente muda o que a pessoa
 *  faz depois de ler. Sem isso, as quatro causas parecem a mesma coisa:
 *  "deu erro". Com isso, a fila se divide em "eu preciso agir", "vai sair
 *  sozinho" e "não adianta insistir". */
export const TONS: Record<Tom, { etiqueta: string; explicacao: string; cor: string }> = {
  voce:    { etiqueta: "Depende de você", explicacao: "Estes pedidos só entram depois de alguém corrigir alguma coisa — esperar não resolve.", cor: "var(--warning)" },
  sozinho: { etiqueta: "Sai sozinho",     explicacao: "Estes pedidos costumam entrar na próxima sincronização automática, sem ninguém fazer nada. Os passos do cartão servem para antecipar ou para os casos em que não sai.", cor: "var(--info)" },
  nosso:   { etiqueta: "É problema do CRM", explicacao: "A falha é do sistema, não do seu cadastro nem do anúncio. Não há o que fazer no canal.", cor: "var(--destructive)" },
  neutro:  { etiqueta: "Sem classificação", explicacao: "O CRM ainda não sabe agrupar este erro. Em geral é tropeço passageiro e passa na segunda tentativa.", cor: "var(--muted-foreground)" },
};

/** O diagnóstico de UM pedido: por que ele ficou de fora e o que fazer com
 *  ele, em passos numerados.
 *
 *  Passos e não parágrafo porque quem abre esta tela está no meio de uma
 *  tarefa, não lendo documentação: precisa saber qual é o PRIMEIRO clique. E
 *  as condições vêm ditas por extenso ("se achou o anúncio…", "se não
 *  achou…") porque o que é óbvio para quem escreveu o CRM não é óbvio para
 *  quem só quer o pedido dentro do sistema. */
export type Diagnostico = { motivo: string; passos: string[] };

const NOMES_CANAL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
};

export function nomeCanal(canal: string): string {
  return NOMES_CANAL[canal] ?? canal;
}

/** Os SKUs que ESTA linha cita. A pendência guarda os SKUs que derrubaram a
 *  ingestão, mas linhas antigas foram gravadas sem eles — aí os itens do
 *  payload servem, que é a mesma informação por outro caminho. */
export function skusDaLinha(linha: PedidoIgnoradoLinha): string[] {
  if (linha.skus.length > 0) return linha.skus;
  return [...new Set(linha.itens.map((item) => item.sku).filter((sku): sku is string => Boolean(sku)))];
}

function listaLegivel(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  if (itens.length === 2) return `${itens[0]} e ${itens[1]}`;
  return `${itens.slice(0, 2).join(", ")} e mais ${itens.length - 2}`;
}

/** Qual campo colidiu, lido do nome do índice único que o banco recusou.
 *  Saber que foi o TELEFONE (e não o e-mail) é o que diz onde procurar o
 *  cadastro conflitante — "cliente duplicado" sozinho não diz. */
function campoDuplicado(linha: PedidoIgnoradoLinha): { rotulo: string; valor: string | null } {
  if (/telefone/i.test(linha.motivo)) return { rotulo: "telefone", valor: linha.compradorTelefone };
  if (/email|e_mail/i.test(linha.motivo)) return { rotulo: "e-mail", valor: null };
  if (/documento|cpf|cnpj/i.test(linha.motivo)) return { rotulo: "documento", valor: null };
  return { rotulo: "cadastro", valor: linha.compradorUsuario };
}

/** O campo que o validador recusou, quando o erro carrega o caminho. */
function campoInvalido(motivo: string): string | null {
  const achado = /"path"\s*:\s*\[\s*"([^"]+)"/.exec(motivo) ?? /path:\s*\[\s*'?"?([\w.]+)/.exec(motivo);
  return achado?.[1] ?? null;
}

/** O erro cru cabe numa frase: o texto inteiro vive em "Ver detalhes". */
function primeiraFrase(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  const corte = limpo.slice(0, 160);
  return corte.length < limpo.length ? `${corte}…` : corte;
}

const CAUSAS: Record<string, {
  rotulo: string;
  icone: LucideIcon;
  tom: Tom;
  /** Uma linha no cabeçalho do grupo: a regra geral da causa. O diagnóstico
   *  de verdade — com o SKU, o comprador, o status deste pedido — mora no
   *  cartão, porque é lá que ele muda de uma linha para a outra. */
  resumo: string;
  diagnostico: (linha: PedidoIgnoradoLinha) => Diagnostico;
}> = {
  sku_sem_produto: {
    rotulo: "SKU sem produto",
    icone: PackageSearch,
    tom: "sozinho",
    resumo: "Falta no CRM o produto do SKU que o pedido vendeu. Costuma entrar sozinho quando o catálogo do canal sincroniza.",
    diagnostico: (linha) => {
      const skus = skusDaLinha(linha);
      const canal = nomeCanal(linha.canal);
      const alvo = skus.length === 1 ? skus[0] : listaLegivel(skus);
      return {
        motivo: skus.length === 0
          ? "O pedido cita um SKU que ainda não existe como produto no CRM. Sem o produto, não há onde pendurar o item vendido, e o pedido inteiro fica de fora."
          : `${skus.length === 1 ? `O SKU ${skus[0]} não existe` : `Os SKUs ${alvo} não existem`} como produto no CRM. Sem o produto, não há onde pendurar o item vendido, e o pedido inteiro fica de fora.`,
        passos: skus.length === 0
          ? [
              `Abra "Ver detalhes" aqui embaixo e leia a linha "Erro registrado": é ela que diz qual SKU faltou. Esta pendência é antiga e foi gravada antes de o CRM guardar o SKU separado.`,
              `Com o SKU em mãos, procure por ele nos anúncios da ${linha.marca} no ${canal}.`,
              `Existe anúncio com esse SKU? Não mexa em nada: o produto entra no CRM na próxima sincronização automática do catálogo e esta linha some sozinha.`,
              `Não quer esperar a sincronização? Clique em "Tentar novamente" aqui embaixo — o CRM rebusca o pedido no ${canal} na hora.`,
            ]
          : [
              `Copie o SKU ${alvo} — é o código no chip cinza logo acima, dentro deste mesmo cartão.`,
              `Abra os anúncios da ${linha.marca} no ${canal} e busque por esse SKU.`,
              `SE ACHOU um anúncio com ele: não mexa em nada no canal. O produto nasce no CRM na próxima sincronização automática do catálogo e a pendência sai sozinha. Para não esperar, clique em "Tentar novamente" aqui embaixo.`,
              `SE NÃO ACHOU: o SKU foi renomeado, ou o anúncio saiu do ar depois da venda. O pedido guarda o SKU do dia da compra e nunca é reescrito — por isso ele continua procurando ${alvo}. Devolva esse SKU ao anúncio no ${canal} e só então volte para cá.`,
              `De volta aqui, clique em "Tentar novamente". Dando certo, a linha desaparece da fila na hora.`,
              `Falhou de novo? Abra "Ver detalhes" e leia "Erro registrado": o motivo pode ter mudado. Se o anúncio não existe mais e não vale recriá-lo, clique em "Não recuperável" — o pedido sai da fila e continua guardado no histórico.`,
            ],
      };
    },
  },
  cliente_duplicado: {
    rotulo: "Cliente duplicado",
    icone: UserRoundX,
    tom: "voce",
    resumo: "O cadastro do comprador colidiu com um cliente que já existe. Resolve-se aqui dentro, não no painel do canal.",
    diagnostico: (linha) => {
      const campo = campoDuplicado(linha);
      const comprador = linha.compradorNome ?? "o comprador";
      const busca = campo.valor ?? comprador;
      const mascarado = linha.canal === "shopee" && campo.rotulo === "telefone";
      return {
        motivo: `${linha.compradorNome ?? "O comprador"} chegou com ${campo.rotulo}${campo.valor ? ` ${campo.valor}` : ""} já usado por outro cliente do CRM, e o cadastro foi recusado.${mascarado ? " Na Shopee o telefone vem mascarado, então compradores diferentes chegam com o mesmo valor — não é erro de cadastro seu." : ""}`,
        passos: [
          `Comece clicando em "Tentar novamente" — sim, antes de investigar qualquer coisa. O CRM passou a reaproveitar o cliente que já tem o mesmo ${campo.rotulo} em vez de insistir em criar outro, e a maior parte destas pendências é anterior a essa correção: elas entram já na primeira tentativa.`,
          `Entrou? Acabou. A linha some da fila e o pedido fica pendurado no cliente que já existia — nenhum cadastro novo é criado.`,
          `Falhou de novo? Copie ${busca}, abra Clientes no menu do topo e busque por esse dado.`,
          `Compare o cliente que aparecer com o comprador deste pedido (nome, ${campo.rotulo} e usuário no canal estão em "Ver detalhes"). É a MESMA pessoa: não crie nada, o CRM vai usar esse cadastro. São pessoas DIFERENTES: edite o ${campo.rotulo} de um dos dois em Clientes, para os dois pararem de disputar o mesmo valor.${mascarado ? " É o caso comum na Shopee, por causa do telefone mascarado." : ""}`,
          `Com os cadastros ajustados, volte para cá e clique em "Tentar novamente".`,
          `Não procure nada no painel do ${nomeCanal(linha.canal)}: o conflito é de dado do CRM, e mexer no anúncio ou na venda lá não muda nada aqui.`,
        ],
      };
    },
  },
  payload_invalido: {
    rotulo: "Formato inesperado",
    icone: Bug,
    tom: "nosso",
    resumo: "O canal mandou o pedido num formato que o CRM não sabe ler. É falha nossa, e não há o que fazer na loja.",
    diagnostico: (linha) => {
      const campo = campoInvalido(linha.motivo);
      const canal = nomeCanal(linha.canal);
      return {
        motivo: campo
          ? `O ${canal} devolveu este pedido com o campo "${campo}" num formato que o CRM não sabe ler. A falha está do nosso lado, não no seu cadastro nem no anúncio.`
          : `O ${canal} devolveu este pedido num formato que o CRM não sabe ler. A falha está do nosso lado, não no seu cadastro nem no anúncio.`,
        passos: [
          `Não procure nada no ${canal} nem em Clientes: nada do que você fizer lá muda este erro, porque ele é do CRM.`,
          `Repare que este cartão não tem o botão "Tentar novamente", e isso é de propósito: o pedido guardado é o mesmo e passaria pelo mesmo validador, dando exatamente este erro outra vez.`,
          `Abra "Ver detalhes" aqui embaixo e copie a linha inteira de "Erro registrado".`,
          `Mande esse texto junto com o número da venda deste cartão para quem cuida do CRM${campo ? `, dizendo que o campo é "${campo}"` : ""}. É com isso que dá para ensinar esse formato ao sistema.`,
          `Enquanto ninguém mexe no CRM, a linha fica aqui parada. Se este pedido é antigo e você não quer mais vê-lo na fila, clique em "Não recuperável": ele sai da lista sem ser apagado do histórico.`,
        ],
      };
    },
  },
  desconhecida: {
    rotulo: "Não classificada",
    icone: HelpCircle,
    tom: "neutro",
    resumo: "Falha sem classificação própria — em geral tropeço passageiro de rede ou de limite da API do canal.",
    diagnostico: (linha) => ({
      motivo: `A importação parou em: "${primeiraFrase(linha.motivo)}" — um erro que ainda não tem classificação própria no CRM.`,
      passos: [
        `Clique em "Tentar novamente". A maior parte do que cai aqui é tropeço passageiro — rede fora, limite de chamadas da API do ${nomeCanal(linha.canal)} — e passa na segunda tentativa.`,
        `Entrou? Acabou: a linha some da fila sozinha, sem mais nenhum passo.`,
        `Falhou? Abra "Ver detalhes" e leia "Erro registrado". Esse texto é regravado a cada tentativa, então ele mostra o erro de AGORA, não o da primeira vez.`,
        `Se o erro novo falar de SKU ou de cliente, não faça nada aqui: no próximo carregamento da página esta linha muda de grupo sozinha e passa a mostrar os passos daquela causa.`,
        `Repetiu o mesmo erro duas ou três vezes? Pare de clicar: copie "Erro registrado" e o número da venda e mande para quem cuida do CRM.`,
      ],
    }),
  },
};

/* Ordem dos grupos: pelo que a pessoa pode fazer, não pelo tamanho. O grupo
   que exige ação humana vem primeiro mesmo tendo duas linhas; o que se
   resolve sozinho vem depois mesmo tendo trinta. Ordenar por quantidade
   colocaria no topo justamente o bloco que não pede nada de ninguém. */
export const ORDEM_CAUSAS = ["cliente_duplicado", "desconhecida", "sku_sem_produto", "payload_invalido"];

export function causaDe(chave: string) {
  return CAUSAS[chave] ?? CAUSAS.desconhecida;
}

/** O que aconteceu com ESTE pedido e o que fazer com ELE, passo a passo.
 *
 *  Parte dos passos da causa e deixa o estado da própria linha sobrescrever o
 *  roteiro, porque o estado manda mais que a causa: um pedido cancelado no
 *  canal não vira receita nem se entrar (caçar o SKU dele é trabalho jogado
 *  fora), e um pedido já descartado não pede ação nenhuma até voltar para a
 *  fila. Sem isso, a tela mandaria seguir seis passos para recuperar dinheiro
 *  que não existe. */
export function diagnosticoDe(linha: PedidoIgnoradoLinha): Diagnostico {
  const causa = causaDe(linha.causa);
  const base = causa.diagnostico(linha);
  const canal = nomeCanal(linha.canal);
  const cancelado = linha.statusCanal !== null && mapearStatusPedido(linha.statusCanal) === "cancelado";

  if (linha.descartadoEm !== null) {
    return {
      ...base,
      passos: [
        `Não há nada a fazer: alguém marcou esta pendência como "Não recuperável" em ${dataCurta(linha.descartadoEm)}, e ela não conta mais na fila nem nos números do topo.`,
        `O pedido não foi apagado — ele continua guardado no histórico, e é por isso que você está vendo esta linha agora.`,
        `Mudou de ideia? Clique em "Devolver à fila" aqui embaixo: a linha volta a contar e os passos de "${causa.rotulo}" voltam a valer.`,
      ],
    };
  }

  if (cancelado) {
    return {
      ...base,
      passos: [
        `Antes de qualquer coisa, confira em "Ver detalhes": o status deste pedido no ${canal} é "Cancelado".`,
        `Pedido cancelado não vira receita nem se entrar no CRM. Recuperá-lo não muda faturamento, não muda Métricas e não muda comissão — o trabalho seria jogado fora.`,
        `Por isso o caminho normal aqui é clicar em "Não recuperável": a linha sai da fila e o pedido continua guardado no histórico, nada é apagado.`,
        `Só insista com "Tentar novamente" se você tem motivo para achar que o cancelamento está errado — e, nesse caso, confirme antes no painel do ${canal}.`,
      ],
    };
  }

  if (linha.tentativas >= 3 && linha.reprocessavel) {
    return {
      ...base,
      passos: [
        ...base.passos,
        `Atenção antes de clicar mais uma vez: já são ${linha.tentativas} tentativas com o mesmo resultado. Se os passos acima que dependem do canal ou de Clientes ainda não foram feitos, clicar de novo vai dar exatamente no mesmo.`,
      ],
    };
  }

  return base;
}

export function diasParado(desde: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000));
}

export function dataCurta(valor: string | Date | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Uma linha da fila. Curta de propósito: tudo que ela NÃO precisa dizer

/* ── Tarefas ──────────────────────────────────────────────────────────────
   O número que assusta nesta tela é a contagem de PEDIDOS; o trabalho de
   verdade é muito menor. Em 30/08/2026 a fila real tinha 43 pedidos e apenas
   8 coisas a resolver: 17 deles eram o mesmo SKU, do mesmo anúncio, com o
   mesmo passo a passo. Repetir seis passos idênticos 17 vezes não ensina
   nada — só faz a pessoa rolar a tela.

   Uma tarefa é "um conserto": mesma causa, mesmo alvo (o SKU, o campo que
   colidiu, o campo que o validador recusou), mesma marca e mesmo canal. A
   marca e o canal entram na chave porque o mesmo SKU em duas lojas é
   trabalho em dois lugares diferentes. */

export type Tarefa = {
  id: string;
  causa: string;
  /** O alvo do conserto, do jeito que se procura no canal: o SKU, o campo. */
  alvo: string | null;
  marca: string;
  marcaSlug: string;
  canal: string;
  linhas: PedidoIgnoradoLinha[];
  /** Só as que ainda pedem ação — descartada não conta em lugar nenhum. */
  abertas: PedidoIgnoradoLinha[];
  valorParado: number;
  diasParado: number;
  /** Os passos que valem para o grupo inteiro, tirados da linha mais antiga:
   *  é a que tem mais chance de já ter sido tentada e ter o motivo atual. */
  diagnostico: Diagnostico;
  /** Quantas linhas ainda podem ser tentadas de novo. */
  reprocessaveis: number;
  concluida: boolean;
};

/** O alvo de uma linha: o que a pessoa vai procurar no canal ou em Clientes. */
function alvoDaLinha(linha: PedidoIgnoradoLinha): string | null {
  if (linha.causa === "sku_sem_produto") {
    const skus = skusDaLinha(linha);
    return skus.length > 0 ? skus.join(" + ") : null;
  }
  if (linha.causa === "cliente_duplicado") return linha.compradorTelefone ?? linha.compradorUsuario;
  if (linha.causa === "payload_invalido") return campoInvalido(linha.motivo);
  // Sem classificação: o texto do erro é o que separa um caso do outro.
  return primeiraFrase(linha.motivo).slice(0, 60);
}

export function agruparEmTarefas(linhas: PedidoIgnoradoLinha[]): Tarefa[] {
  const porChave = new Map<string, PedidoIgnoradoLinha[]>();
  for (const linha of linhas) {
    const chave = `${linha.causa}|${linha.marcaSlug}|${linha.canal}|${alvoDaLinha(linha) ?? "—"}`;
    const atual = porChave.get(chave);
    if (atual) atual.push(linha);
    else porChave.set(chave, [linha]);
  }

  const tarefas: Tarefa[] = [...porChave.entries()].map(([id, doGrupo]) => {
    const ordenadas = [...doGrupo].sort(
      (a, b) => new Date(a.primeiraVezEm).getTime() - new Date(b.primeiraVezEm).getTime(),
    );
    const primeira = ordenadas[0];
    const abertas = ordenadas.filter((linha) => linha.descartadoEm === null);
    return {
      id,
      causa: primeira.causa,
      alvo: alvoDaLinha(primeira),
      marca: primeira.marca,
      marcaSlug: primeira.marcaSlug,
      canal: primeira.canal,
      linhas: ordenadas,
      abertas,
      valorParado: abertas.reduce((soma, linha) => soma + Number(linha.total ?? 0), 0),
      diasParado: abertas.reduce((maior, linha) => Math.max(maior, diasParado(linha.primeiraVezEm)), 0),
      diagnostico: diagnosticoDe(primeira),
      reprocessaveis: abertas.filter((linha) => linha.reprocessavel).length,
      concluida: abertas.length === 0,
    };
  });

  /* Ordem do roteiro: primeiro o que depende de alguém agir (senão a pessoa
     percorre trinta etapas automáticas antes de chegar na única que precisa
     dela), e dentro da mesma causa o dinheiro maior antes. Tarefa já fechada
     cai para o fim — continua visível, mas não abre o roteiro. */
  return tarefas.sort((a, b) => {
    if (a.concluida !== b.concluida) return a.concluida ? 1 : -1;
    const ordem = ORDEM_CAUSAS.indexOf(a.causa) - ORDEM_CAUSAS.indexOf(b.causa);
    if (ordem !== 0) return ordem;
    return b.valorParado - a.valorParado;
  });
}
