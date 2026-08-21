import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import navigationConfig from "@/config/navigation.json";

describe("rota canônica de Publicidade", () => {
  it("usa /publicidade na navegação", () => {
    expect(navigationConfig.items.find((item) => item.id === "anuncios")).toMatchObject({
      href: "/publicidade",
      label: "Publicidade",
    });
  });

  it("mantém os links antigos compatíveis e serve o módulo no novo endereço", async () => {
    const redirects = await nextConfig.redirects?.();
    const rewrites = await nextConfig.rewrites?.();

    expect(redirects).toContainEqual({
      source: "/anuncios/:path*",
      destination: "/publicidade/:path*",
      permanent: true,
    });
    expect(rewrites).toContainEqual({
      source: "/publicidade/:path*",
      destination: "/anuncios/:path*",
    });
  });
});
