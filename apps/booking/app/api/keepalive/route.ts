import { NextResponse } from "next/server";
import { createReservationClient } from "@reservia/api-client";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron hits this once a day so Supabase sees real API activity and
 * never auto-pauses the free-tier project after 7 days of silence. A
 * trivial public read is enough -- no writes, no service role needed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createReservationClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await supabase.from("restaurants").select("id").limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}
