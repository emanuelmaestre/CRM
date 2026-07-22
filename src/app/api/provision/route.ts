import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/shared/lib/db";
import { org, brand, appUser } from "@/shared/lib/db/schema";
import { eq } from "drizzle-orm";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import crypto from "node:crypto";
import { z } from "zod";

const SECRET = process.env.PROVISION_SECRET;
const ProvisionSchema = z.object({
  email: z.string().trim().email(),
  nome: z.string().trim().min(2).max(120).optional(),
  perfil: z.enum(["admin", "gestor", "vendedor"]).default("vendedor"),
});

function segredoValido(recebido: string | null) {
  if (!SECRET || !recebido) return false;
  const atual = Buffer.from(recebido);
  const esperado = Buffer.from(SECRET);
  return atual.length === esperado.length && crypto.timingSafeEqual(atual, esperado);
}

export async function POST(req: NextRequest) {
  const bloqueio = await verificarRateLimit(req, "provision");
  if (bloqueio) return bloqueio;

  const token = req.headers.get("x-provision-secret");
  if (!segredoValido(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role to look up auth.users by email
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const input = ProvisionSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Payload inválido", detalhes: input.error.flatten() }, { status: 422 });
  }

  let authUser;
  try {
    for (let page = 1; page <= 10 && !authUser; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      authUser = data.users.find((user) =>
        user.email?.toLowerCase() === input.data.email.toLowerCase(),
      );
      if (data.users.length < 1000) break;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar usuário" }, { status: 500 });
  }
  if (!authUser) {
    return NextResponse.json({ error: "Usuário não encontrado no Supabase Auth" }, { status: 404 });
  }

  const orgId = process.env.DEFAULT_ORG_ID!;
  const brandKarziId = process.env.BRAND_ID_KARZI ?? process.env.NEXT_PUBLIC_BRAND_ID_KARZI!;
  const brandWuwuId = process.env.BRAND_ID_WUWU ?? process.env.NEXT_PUBLIC_BRAND_ID_WUWU!;

  // 1. Ensure org exists
  const existingOrg = await db.select().from(org).where(eq(org.id, orgId)).then(r => r[0]);
  if (!existingOrg) {
    await db.insert(org).values({ id: orgId, name: "Plast Leo", cnpj: "00000000000000", active: true });
  }

  // 2. Ensure brands exist
  const existingKarzi = await db.select().from(brand).where(eq(brand.id, brandKarziId)).then(r => r[0]);
  if (!existingKarzi) {
    await db.insert(brand).values({ id: brandKarziId, orgId, name: "KARZI", slug: "karzi", active: true });
  }

  const existingWuwu = await db.select().from(brand).where(eq(brand.id, brandWuwuId)).then(r => r[0]);
  if (!existingWuwu) {
    await db.insert(brand).values({ id: brandWuwuId, orgId, name: "WUWU", slug: "wuwu", active: true });
  }

  // 3. Ensure app_user exists
  const existingUser = await db.select().from(appUser).where(eq(appUser.id, authUser.id)).then(r => r[0]);
  if (!existingUser) {
    await db.insert(appUser).values({
      id: authUser.id,
      orgId,
      email: authUser.email!,
      nome: input.data.nome || authUser.user_metadata?.full_name || authUser.email!.split("@")[0],
      perfil: input.data.perfil,
      ativo: true,
    });
  }

  return NextResponse.json({
    ok: true,
    provisioned: {
      orgId,
      userId: authUser.id,
      email: authUser.email,
      orgCreated: !existingOrg,
      karziCreated: !existingKarzi,
      wuwuCreated: !existingWuwu,
      userCreated: !existingUser,
    },
  });
}
