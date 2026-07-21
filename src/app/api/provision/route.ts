import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/shared/lib/db";
import { org, brand, appUser } from "@/shared/lib/db/schema";
import { eq } from "drizzle-orm";

const SECRET = process.env.PROVISION_SECRET;

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-provision-secret");
  if (!SECRET || token !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role to look up auth.users by email
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { email } = await req.json().catch(() => ({}));
  const targetEmail: string = email || "emanuelmaestre1@gmail.com";

  const { data: { users }, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const authUser = users.find((u) => u.email === targetEmail);
  if (!authUser) {
    return NextResponse.json({ error: `No auth user found for ${targetEmail}` }, { status: 404 });
  }

  const orgId = process.env.DEFAULT_ORG_ID!;
  const brandKarziId = process.env.BRAND_ID_KARZI!;
  const brandWuwuId = process.env.BRAND_ID_WUWU!;

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
      nome: authUser.user_metadata?.full_name || authUser.email!.split("@")[0],
      perfil: "admin",
      ativo: "true",
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
