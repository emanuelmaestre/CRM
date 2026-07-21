import { describe, it, expect } from "vitest";
import { z } from "zod";

const LinhaClienteSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email().optional(),
  telefone: z.string().optional(),
  cpf_cnpj: z.string().optional(),
});

describe("Pipeline de importação — validação de linhas", () => {
  it("aceita linha válida com nome e email", () => {
    const resultado = LinhaClienteSchema.safeParse({ nome: "Maria Silva", email: "maria@email.com" });
    expect(resultado.success).toBe(true);
  });

  it("aceita linha com apenas nome", () => {
    const resultado = LinhaClienteSchema.safeParse({ nome: "João Souza" });
    expect(resultado.success).toBe(true);
  });

  it("rejeita linha sem nome", () => {
    const resultado = LinhaClienteSchema.safeParse({ email: "sem@nome.com" });
    expect(resultado.success).toBe(false);
  });

  it("rejeita nome com menos de 2 caracteres", () => {
    const resultado = LinhaClienteSchema.safeParse({ nome: "A" });
    expect(resultado.success).toBe(false);
  });

  it("rejeita e-mail inválido", () => {
    const resultado = LinhaClienteSchema.safeParse({ nome: "Teste", email: "nao-e-email" });
    expect(resultado.success).toBe(false);
  });

  it("preview conta aceitos e rejeitados sem persistir", () => {
    const linhas = [
      { nome: "Cliente Válido", email: "valido@teste.com" },
      { nome: "A" },
      { email: "sem_nome@teste.com" },
    ];
    const erros: { linha: number; motivo: string }[] = [];
    const validos = [];

    for (let i = 0; i < linhas.length; i++) {
      const r = LinhaClienteSchema.safeParse(linhas[i]);
      if (r.success) validos.push(r.data);
      else erros.push({ linha: i + 1, motivo: r.error.message });
    }

    expect(validos.length).toBe(1);
    expect(erros.length).toBe(2);
  });
});
