import { z } from "zod";
import { validarCpfCnpj } from "./identity";

// Tipo de `interacao.tipo` usado para diferenciar anotações livres do
// restante do histórico (mensagens de canal, eventos automáticos etc).
export const TIPO_INTERACAO_ANOTACAO = "anotacao";

const CpfCnpjSchema = z.string().trim().refine(
  validarCpfCnpj,
  "CPF/CNPJ inválido",
);

export const ClienteSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  nome: z.string().min(2, "Nome deve ter ao menos 2 caracteres"),
  email: z.string().email("E-mail inválido").nullish(),
  telefone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Telefone deve estar no formato E.164 (+5511999999999)").nullish(),
  cpfCnpj: CpfCnpjSchema.nullish(),
  dataNascimento: z.iso.date().nullish(),
  deletedAt: z.date().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateClienteSchema = ClienteSchema.omit({
  id: true, orgId: true, deletedAt: true, createdAt: true, updatedAt: true,
}).partial({ email: true, telefone: true, cpfCnpj: true, dataNascimento: true });

export const UpdateClienteSchema = CreateClienteSchema.partial();

export type Cliente = z.infer<typeof ClienteSchema>;
export type CreateClienteDTO = z.infer<typeof CreateClienteSchema>;
export type UpdateClienteDTO = z.infer<typeof UpdateClienteSchema>;

export const ConsentimentoSchema = z.object({
  id: z.string().uuid(),
  clienteId: z.string().uuid(),
  orgId: z.string().uuid(),
  brandId: z.string().uuid(),
  finalidade: z.enum(["marketing", "avaliacao", "suporte", "cobranca"]),
  canal: z.enum(["instagram", "facebook", "email", "mercadolivre", "shopee", "tiktokshop", "olist", "manual"]),
  status: z.enum(["ativo", "revogado"]),
  origem: z.string(),
  prova: z.string().nullish(),
  revokedAt: z.date().nullish(),
  createdAt: z.date(),
});

export type Consentimento = z.infer<typeof ConsentimentoSchema>;

export const CriarAnotacaoSchema = z.object({
  clienteId: z.string().uuid(),
  texto: z.string().trim().min(1, "Anotação não pode ser vazia").max(2_000),
});

export type CriarAnotacaoDTO = z.input<typeof CriarAnotacaoSchema>;

export function temConsentimento(
  consentimentos: Consentimento[],
  brandId: string,
  finalidade: Consentimento["finalidade"],
  canal: Consentimento["canal"]
): boolean {
  return consentimentos.some(
    (c) =>
      c.brandId === brandId &&
      c.finalidade === finalidade &&
      c.canal === canal &&
      c.status === "ativo"
  );
}
