import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const consultar = vi.hoisted(() => vi.fn());
vi.mock("@/modules/canais/application/qualidade-dados.service", () => ({ consultarQualidadeDados: consultar }));
import { AvisoQualidadeDados } from "@/modules/canais/ui/aviso-qualidade-dados";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("expõe quarentena e conexão degradada sem afirmar conciliação", async () => {
  consultar.mockResolvedValue([{ id: "1", marca: "Loja A", canal: "shopee", status: "degradado", pendentes: 2, quarentena: 3, estoquePendente: 4, ultimaColeta: null, ultimaAvaliacao: null }]);
  render(await AvisoQualidadeDados({ orgId: "org" }));
  expect(screen.getByText(/5 pendências de pedidos/)).toBeInTheDocument();
  expect(screen.getByText(/3 na importação histórica/)).toBeInTheDocument();
  expect(screen.getByText(/ainda não certificada/)).toBeInTheDocument();
  expect(consultar).toHaveBeenCalledWith("org");
});

it("falha do banco mostra estado desconhecido, nunca fila zerada", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  consultar.mockRejectedValue(new Error("offline"));
  render(await AvisoQualidadeDados({ orgId: "org" }));
  expect(screen.getByRole("alert")).toHaveTextContent("não significa ausência de pendências");
  expect(screen.queryByText(/0 pendências/)).not.toBeInTheDocument();
});
