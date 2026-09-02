// Fase 1 de integraciones POS: receptor genérico de webhooks.
//
// Ningún proveedor real está conectado todavía. Esta función fija la forma
// que cualquier proveedor futuro (Lightspeed, Oracle Simphony, ICG) va a
// tener que respetar: verificación de firma, idempotencia por
// (provider, external_event_id), aislamiento por restaurante, logging sin
// secretos, y manejo de errores que nunca deja pasar un request no
// verificado.
//
// `verifySignature` siempre devuelve false hasta que un proveedor real
// tenga su verificación implementada -- por diseño, así que esta función es
// inerte incluso si se deployara por error hoy: ningún request puede pasar.
//
// NO deployada todavía (`supabase functions deploy pos-webhook` queda
// pendiente para cuando haya al menos un secreto de firma real que
// verificar). Deployar requiere `verify_jwt = false` (ver
// supabase/config.toml) porque los proveedores de POS no van a mandar un JWT
// de Supabase -- la autenticación acá es la firma del webhook, no un token
// de sesión.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const KNOWN_PROVIDERS = ["mock", "oracle_simphony", "lightspeed", "icg"] as const;
type Provider = (typeof KNOWN_PROVIDERS)[number];

function isKnownProvider(value: string): value is Provider {
  return (KNOWN_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Cada proveedor real define su propio esquema de firma (HMAC-SHA256 sobre
 * el body crudo con un header propio, por ejemplo). Hasta que exista un
 * proveedor real conectado -- con su secreto guardado en Supabase Vault, no
 * en una env var del edge function -- esto rechaza todo, a propósito.
 */
function verifySignature(_provider: Provider, _rawBody: string, _headers: Headers): boolean {
  return false;
}

function log(msg: string, extra?: Record<string, unknown>) {
  // Nunca loguear rawBody completo ni ningún header de firma/autorización --
  // solo lo mínimo para operar (proveedor, id de evento, resultado).
  console.log(JSON.stringify({ fn: "pos-webhook", msg, ...extra }));
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const providerParam = url.searchParams.get("provider") ?? url.pathname.split("/").filter(Boolean).pop() ?? "";

    if (!isKnownProvider(providerParam)) {
      log("unknown_provider", { provider: providerParam });
      return new Response(JSON.stringify({ error: "unknown provider" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const rawBody = await req.text();

    if (!verifySignature(providerParam, rawBody, req.headers)) {
      log("signature_rejected", { provider: providerParam });
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    // Inalcanzable hasta que verifySignature tenga una implementación real
    // para al menos un proveedor. El resto del flujo (idempotencia,
    // inserción, respuesta) ya queda listo para ese momento.
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const externalEventId = String(payload.event_id ?? payload.id ?? "");
    if (!externalEventId) {
      return new Response(JSON.stringify({ error: "missing event id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // El unique(provider, external_event_id) de pos_webhook_events es la
    // idempotencia real: un reenvío del mismo evento choca acá y nunca llega
    // a procesarse dos veces. El procesamiento específico por proveedor
    // (incluyendo qué hacer con eventos que llegan fuera de orden, comparando
    // timestamps del payload contra el estado ya guardado) queda para cuando
    // exista un payload real que darle forma -- no hay uno todavía.
    const { error: insertError } = await supabase.from("pos_webhook_events").insert({
      provider: providerParam,
      external_event_id: externalEventId,
      event_type: typeof payload.event_type === "string" ? payload.event_type : null,
      payload,
      status: "pending",
    });

    if (insertError) {
      if (insertError.code === "23505") {
        log("duplicate_event_ignored", { provider: providerParam, externalEventId });
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      log("insert_failed", { provider: providerParam, error: insertError.message });
      return new Response(JSON.stringify({ error: "internal error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    log("event_received", { provider: providerParam, externalEventId });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    console.error(JSON.stringify({ fn: "pos-webhook", msg: "unhandled_error", error: String(err) }));
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
