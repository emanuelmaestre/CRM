import { NextResponse, type NextRequest } from "next/server";

// Proxy mínimo: apenas passa a requisição adiante.
// Auth é verificada nos layouts server-side via supabase.auth.getUser().
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
