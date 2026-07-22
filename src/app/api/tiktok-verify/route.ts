import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return new NextResponse(
    "tiktok-developers-site-verification=ptbw0AK1yP4OTOYbtaTkuwMBl3ChdjhS",
    { headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}
