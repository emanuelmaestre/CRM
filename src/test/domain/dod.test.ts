import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { structuredLog } from "@/shared/observability/structured-log";

const root = process.cwd();

describe("Definition of Done da Fase A", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mantém estados globais de carregamento e erro no App Router", () => {
    expect(fs.existsSync(path.join(root, "src/app/(dashboard)/loading.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/app/(dashboard)/error.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/app/global-error.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/app/(dashboard)/sem-permissao/page.tsx"))).toBe(true);
  });

  it("respeita redução de movimento em CSS e Framer Motion", () => {
    const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
    const provider = fs.readFileSync(path.join(root, "src/shared/providers/motion-provider.tsx"), "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(provider).toContain('reducedMotion="user"');
  });

  it("emite logs JSON estruturados para correlação", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    structuredLog("error", "test.failure", { correlationId: "dod-test" });
    expect(error).toHaveBeenCalledOnce();
    const payload = JSON.parse(error.mock.calls[0][0] as string);
    expect(payload).toMatchObject({
      level: "error",
      event: "test.failure",
      correlationId: "dod-test",
    });
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("mantém todos os critérios da Fase A verificados após o aceite final", () => {
    const dod = JSON.parse(
      fs.readFileSync(path.join(root, "docs/fase-a-dod.json"), "utf8"),
    ) as { status: string; criteria: Array<{ status: string }> };
    expect(dod.status).toBe("completed");
    expect(dod.criteria.filter((item) => item.status === "verified")).toHaveLength(12);
    expect(dod.criteria.some((item) => item.status.includes("pending"))).toBe(false);
  });
});
