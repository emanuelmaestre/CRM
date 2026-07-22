import { z } from "zod";
import { validarCpfCnpj } from "./identity";

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
  canal: z.enum(["whatsapp", "instagram", "facebook", "email", "mercadolivre", "shopee", "tiktokshop", "olist", "manual"]),
  status: z.enum(["ativo", "revogado"]),
  origem: z.string(),
  prova: z.string().nullish(),
  revokedAt: z.date().nullish(),
  createdAt: z.date(),
});

export type Consentimento = z.infer<typeof ConsentimentoSchema>;

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
