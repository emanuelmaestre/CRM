/** Campos do cliente que a anonimização precisa zerar, em um lugar só.
 *
 *  Existe porque HÁ DOIS caminhos que anonimizam o mesmo registro — a
 *  solicitação LGPD atendida à mão (`anonimizarSolicitacaoLgpd`) e a retenção
 *  automática de inativos (job A22) — e eles divergiram: o job zerava apenas
 *  nome, e-mail, telefone, CPF e nascimento, deixando para trás o nome
 *  completo do destinatário, o endereço de entrega inteiro e a
 *  geolocalização. Um cliente "anonimizado" pela retenção continuava
 *  identificável por rua, número e CEP.
 *
 *  Campo novo de dado pessoal em `cliente` entra aqui, e os dois caminhos
 *  passam a limpá-lo sem que ninguém precise lembrar do outro. */
export function camposAnonimizadosCliente(nome: string, quando: Date) {
  return {
    nome,
    email: null,
    telefone: null,
    cpfCnpj: null,
    dataNascimento: null,
    // Enriquecimento vindo do endereço de entrega do pedido (hoje Mercado
    // Livre) — mesmo dado pessoal que os campos acima.
    nomeCompleto: null,
    enderecoRua: null,
    enderecoNumero: null,
    enderecoComplemento: null,
    enderecoBairro: null,
    enderecoCidade: null,
    enderecoEstado: null,
    enderecoCep: null,
    enderecoLatitude: null,
    enderecoLongitude: null,
    updatedAt: quando,
  } as const;
}
