import { NextResponse } from "next/server";
import { createReservationClient } from "@reservia/api-client";

export const dynamic = "force-dynamic";

/**
 * API universal de POS: cualquier sistema manda sus cuentas a Reservia con una clave por restaurante.
 *
 *   POST /api/pos   Authorization: Bearer <clave>   {"check_id": "1042", "table": "12", "total": 45900}
 *   GET  /api/pos?key=<clave>&check_id=1042&table=12&total=45900&status=paid    (para sistemas que solo pueden abrir una URL)
 *   GET  /api/pos?key=<clave>                                                    (ping: prueba la URL y la clave)
 *
 * Toda la lógica vive en la base (RPC pos_ingest): acá solo se arma el payload y se traduce el resultado a HTTP.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-api-key",
};

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function client() {
  return createReservationClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

function keyFromHeaders(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) return auth.replace(/^Bearer\s+/i, "").trim();
  return request.headers.get("x-api-key")?.trim() ?? null;
}

function statusFor(result: { ok?: boolean; error?: string; results?: { ok?: boolean }[] }): number {
  if (result.ok) return 200;
  if (result.error === "invalid_api_key") return 401;
  if (result.error === "rate_limited") return 429;
  if (result.error === "suspended") return 403;
  if (result.results?.some((r) => r.ok)) return 207;
  return 400;
}

async function ingest(key: string, payload: unknown) {
  const { data, error } = await client().rpc("pos_ingest", { p_api_key: key, p_payload: payload });
  if (error) return reply({ ok: false, error: "server_error", message: error.message }, 502);
  return reply(data, statusFor(data));
}

async function ping(key: string) {
  const { data, error } = await client().rpc("pos_ping", { p_api_key: key });
  if (error) return reply({ ok: false, error: "server_error", message: error.message }, 502);
  return reply(data, statusFor(data));
}

const HELP = {
  ok: true,
  service: "Reservia · API universal de POS",
  how_to: {
    auth: "Header  Authorization: Bearer TU_CLAVE   (o ?key=TU_CLAVE en la URL)",
    minimum: { method: "POST", body: { check_id: "1042", table: "12", total: 45900 } },
    optional_fields: {
      status: "open | bill (cuenta pedida) | paid (pagada) | cancelled",
      items: [{ name: "Lomo vetado", quantity: 2, price: 12900 }],
      guests: 4,
    },
    simple_url: "GET /api/pos?key=TU_CLAVE&check_id=1042&table=12&total=45900&status=paid",
  },
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const raw = await request.text();

  let body: unknown = null;
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      const form = new URLSearchParams(raw);
      body = form.size > 0 ? Object.fromEntries(form.entries()) : null;
    }
  }
  if (body === null) {
    return reply({ ok: false, error: "invalid_body", message: 'El cuerpo tiene que ser JSON, por ejemplo {"check_id": "1042", "table": "12", "total": 45900}.' }, 400);
  }

  let key = keyFromHeaders(request) ?? url.searchParams.get("key");
  if (!key && body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    const inBody = obj.api_key ?? obj.key;
    if (typeof inBody === "string") {
      key = inBody;
      delete obj.api_key;
      delete obj.key;
    }
  }
  if (!key) return reply({ ok: false, error: "invalid_api_key", message: "Falta la clave: usa el header Authorization: Bearer TU_CLAVE." }, 401);

  return ingest(key, body);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = keyFromHeaders(request) ?? url.searchParams.get("key");
  if (!key) return reply(HELP);

  const params = Object.fromEntries([...url.searchParams.entries()].filter(([name]) => name !== "key"));
  if (Object.keys(params).length === 0) return ping(key);
  return ingest(key, params);
}
