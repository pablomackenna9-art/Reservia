#!/usr/bin/env node
// Simula un día de servicio "como si estuviera funcionando" en el restaurante demo, para
// probar el panel con datos creíbles: mesas ya sentadas, reservas del almuerzo ya terminadas,
// reservas aceptadas para más tarde (algunas ya re-confirmadas por el cliente) y, sobre todo,
// solicitudes de reserva que llegaron desde la página pública y esperan que TÚ las aceptes
// (con ubicación pedida, notas, correo y teléfono), más lista de espera y un cliente que avisó
// que no viene.
//
// Uso:
//   node supabase/seed/simulate-day.mjs                  # arma el día
//   node supabase/seed/simulate-day.mjs --drip 6 --every 75
//        # además, sigue llegando una solicitud nueva cada 75 s (6 en total), como en un día real
//   node supabase/seed/simulate-day.mjs --slug otro-restaurante
//
// Solo toca el restaurante indicado (por defecto restaurante-demo). Reemplaza su actividad de
// ejemplo: borra reservas no completadas y la lista de espera, y las completadas marcadas '[sim]'
// de corridas anteriores. Nunca borra clientes. Solo usa clientes con correo @example.com, así
// los correos automáticos nunca salen a una dirección real.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = t.slice(eq + 1).trim();
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (en supabase/seed/.env).");
  process.exit(1);
}

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SLUG = argValue("--slug", "restaurante-demo");
const DRIP = Number(argValue("--drip", "0"));
const EVERY = Number(argValue("--every", "75"));

const TZ = "America/Santiago";
const DURATION_MIN = 90;
const BUFFER_MIN = 15;
const LUNCH = { from: [13, 0], to: [15, 0] };
const DINNER = { from: [19, 0], to: [21, 0] };

const headers = { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------- hora de Santiago ----------
function tzOffsetMinutes(date) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-3"
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(part ?? "GMT");
  return m ? Number(m[1]) * 60 + (m[1].startsWith("-") ? -1 : 1) * Number(m[2] ?? 0) : 0;
}
function santiagoParts(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute) };
}
/** Fecha real (UTC) de "día + offset, hh:mm" en hora de Santiago. */
function at(dayOffset, h, mi) {
  const now = santiagoParts(new Date());
  const guess = Date.UTC(now.y, now.mo - 1, now.d + dayOffset, h, mi);
  let result = guess - tzOffsetMinutes(new Date(guess)) * 60_000;
  result = guess - tzOffsetMinutes(new Date(result)) * 60_000;
  return new Date(result);
}
function slotsOf(service) {
  const out = [];
  for (let m = service.from[0] * 60 + service.from[1]; m <= service.to[0] * 60 + service.to[1]; m += 15) out.push([Math.floor(m / 60), m % 60]);
  return out;
}

// ---------- azar ----------
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
function weighted(items) {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[0][0];
}
const partySizeRoll = () => weighted([[2, 34], [4, 24], [3, 12], [1, 4], [5, 8], [6, 8], [7, 3], [8, 4], [9, 1], [10, 2]]);

const NOTES = [
  "Cumpleaños, si se puede mesa tranquila",
  "Una persona celíaca",
  "Silla de bebé, por favor",
  "Aniversario: nos gustaría algo íntimo",
  "Llegamos 10 minutos tarde probablemente",
  "Preferimos cerca de la ventana",
  "Cena de trabajo, necesitamos conversar",
];

async function main() {
  const [restaurant] = await rest(`restaurants?slug=eq.${SLUG}&select=id,name,created_by`);
  if (!restaurant) throw new Error(`No existe el restaurante '${SLUG}'.`);
  const rid = restaurant.id;
  const ownerId = restaurant.created_by;

  console.log(`Simulando un día en ${restaurant.name}...`);

  const [zones, tables, customersAll] = await Promise.all([
    rest(`zones?restaurant_id=eq.${rid}&active=eq.true&select=id,name&order=sort_order`),
    rest(`tables?restaurant_id=eq.${rid}&active=eq.true&blocked=eq.false&select=id,name,zone_id,capacity_min,capacity_max`),
    rest(`customers?restaurant_id=eq.${rid}&email=like.*@example.com&blacklisted=eq.false&select=id,first_name&limit=1000`),
  ]);
  if (tables.length === 0) throw new Error("Este restaurante no tiene mesas.");
  if (customersAll.length < 40) throw new Error("Hacen falta al menos 40 clientes con correo @example.com.");

  // limpieza de la simulación anterior (nunca clientes)
  await rest(`reservations?restaurant_id=eq.${rid}&status=neq.completed`, { method: "DELETE" });
  await rest(`reservations?restaurant_id=eq.${rid}&internal_notes=eq.%5Bsim%5D`, { method: "DELETE" });
  await rest(`waitlist_entries?restaurant_id=eq.${rid}`, { method: "DELETE" });

  const customerQueue = shuffle(customersAll);
  const nextCustomer = () => {
    const c = customerQueue.pop() ?? pick(customersAll);
    return c.id;
  };

  const now = Date.now();
  const bookings = new Map(); // tableId -> [[startMs, endMs]]
  const overlaps = (tableId, s, e) =>
    (bookings.get(tableId) ?? []).some(([bs, be]) => s < be + BUFFER_MIN * 60_000 && e + BUFFER_MIN * 60_000 > bs);
  const book = (tableId, s, e) => {
    if (!bookings.has(tableId)) bookings.set(tableId, []);
    bookings.get(tableId).push([s, e]);
  };

  const rows = [];
  const base = {
    restaurant_id: rid,
    table_id: null,
    notes: null,
    internal_notes: null,
    total_amount: null,
    created_by: ownerId,
    preferred_zone_id: null,
    customer_response: null,
    customer_responded_at: null,
  };
  const counts = { completed: 0, seated: 0, arriving: 0, confirmed: 0, pending: 0, declined: 0 };

  // --- Reservas ya con mesa: almuerzo y cena de hoy ---
  const services = [
    { slots: slotsOf(LUNCH), fraction: 0.6, weights: (h, m) => (h === 13 ? 3 : h === 14 ? 2 : 1) },
    { slots: slotsOf(DINNER), fraction: 0.82, weights: (h, m) => (h === 20 ? 4 : h === 19 && m >= 30 ? 3 : 2) },
  ];
  for (const service of services) {
    const target = Math.round(tables.length * service.fraction);
    let made = 0;
    let guard = 0;
    while (made < target && guard++ < target * 8) {
      const [h, m] = weighted(service.slots.map((s) => [s, service.weights(s[0], s[1])]));
      const startsAt = at(0, h, m);
      const endsAt = new Date(startsAt.getTime() + DURATION_MIN * 60_000);
      const party = partySizeRoll();
      const fits = shuffle(tables).find(
        (t) => t.capacity_min <= party && t.capacity_max >= party && !overlaps(t.id, startsAt.getTime(), endsAt.getTime()),
      );
      if (!fits) continue;
      book(fits.id, startsAt.getTime(), endsAt.getTime());

      const startMs = startsAt.getTime();
      const endMs = endsAt.getTime();
      let status;
      if (endMs <= now) status = "completed";
      else if (startMs <= now) status = "seated";
      else if (startMs - now <= 20 * 60_000) status = "arriving";
      else status = "confirmed";

      const row = {
        ...base,
        customer_id: nextCustomer(),
        table_id: fits.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: party,
        status,
        source: weighted([["public_portal", 4], ["admin", 2], ["phone", 3], ["walk_in", status === "seated" ? 2 : 0]]),
      };
      if (status === "completed") {
        row.total_amount = party * (14000 + rnd(16000));
        row.internal_notes = "[sim]";
      }
      if (status === "confirmed" || status === "arriving") {
        // aceptadas por el restaurante: la mitad ya re-confirmó desde su enlace
        if (Math.random() < 0.5) {
          row.customer_response = "confirmed";
          row.customer_responded_at = new Date(now - rnd(120) * 60_000).toISOString();
        }
      }
      rows.push(row);
      counts[status]++;
      made++;
    }
  }

  // --- Solicitudes pendientes: lo que TÚ debes aceptar ---
  const futureToday = [...slotsOf(LUNCH), ...slotsOf(DINNER)].filter(([h, m]) => at(0, h, m).getTime() > now + 30 * 60_000);
  const pendingPlan = [];
  const todayCount = Math.min(5, futureToday.length ? 5 : 0);
  for (let i = 0; i < todayCount; i++) pendingPlan.push({ day: 0, slot: pick(futureToday) });
  const tomorrowSlots = [...slotsOf(LUNCH), ...slotsOf(DINNER)];
  for (let i = 0; i < (todayCount ? 4 : 8); i++) pendingPlan.push({ day: 1, slot: pick(tomorrowSlots) });

  const zoneNameWeights = zones.map((z) => [z.id, z.name === "Terraza" ? 5 : z.name === "Salón Principal" ? 4 : 1]);
  for (let i = 0; i < pendingPlan.length; i++) {
    const { day, slot } = pendingPlan[i];
    const startsAt = at(day, slot[0], slot[1]);
    const party = i === 0 ? 9 : partySizeRoll();
    const wantsZone = Math.random() < 0.6;
    rows.push({
      ...base,
      customer_id: nextCustomer(),
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + DURATION_MIN * 60_000).toISOString(),
      party_size: party,
      status: "pending",
      source: "public_portal",
      notes: Math.random() < 0.45 ? pick(NOTES) : null,
      preferred_zone_id: wantsZone ? weighted(zoneNameWeights) : null,
    });
    counts.pending++;
  }

  // --- Un cliente que avisó que no viene (mesa liberada) ---
  {
    const slot = pick(futureToday.length ? futureToday : tomorrowSlots);
    const day = futureToday.length ? 0 : 1;
    const startsAt = at(day, slot[0], slot[1]);
    const endsAt = new Date(startsAt.getTime() + DURATION_MIN * 60_000);
    const table = shuffle(tables).find(
      (t) => t.capacity_min <= 4 && t.capacity_max >= 4 && !overlaps(t.id, startsAt.getTime(), endsAt.getTime()),
    );
    if (table) {
      rows.push({
        ...base,
        customer_id: nextCustomer(),
        table_id: table.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: 4,
        status: "cancelled",
        source: "public_portal",
        customer_response: "declined",
        customer_responded_at: new Date(now - 8 * 60_000).toISOString(),
      });
      counts.declined++;
    }
  }

  for (let i = 0; i < rows.length; i += 50) {
    await rest("reservations", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows.slice(i, i + 50)) });
  }

  // --- Lista de espera ---
  for (let i = 0; i < 3; i++) {
    await rest("waitlist_entries", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ restaurant_id: rid, customer_id: nextCustomer(), party_size: 2 + rnd(5), status: "waiting", priority: i === 0 ? 1 : 0 }),
    });
  }

  console.log(
    `Listo: ${counts.seated} mesas sentadas ahora, ${counts.arriving} por llegar, ${counts.confirmed} confirmadas para más tarde, ` +
      `${counts.completed} del almuerzo ya terminadas, ${counts.pending} solicitudes esperando tu respuesta, ` +
      `${counts.declined} cliente que avisó que no viene y 3 en lista de espera.`,
  );

  // --- Llegadas en vivo ---
  for (let n = 1; n <= DRIP; n++) {
    await new Promise((r) => setTimeout(r, EVERY * 1000));
    const useToday = futureToday.length > 0 && Math.random() < 0.7;
    const slot = pick(useToday ? futureToday : tomorrowSlots);
    const startsAt = at(useToday ? 0 : 1, slot[0], slot[1]);
    const party = partySizeRoll();
    const customerId = nextCustomer();
    await rest("reservations", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        ...base,
        customer_id: customerId,
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + DURATION_MIN * 60_000).toISOString(),
        party_size: party,
        status: "pending",
        source: "public_portal",
        notes: Math.random() < 0.4 ? pick(NOTES) : null,
        preferred_zone_id: Math.random() < 0.6 ? weighted(zoneNameWeights) : null,
      }),
    });
    console.log(`  Llegó solicitud nueva (${n}/${DRIP}): ${party} personas, ${useToday ? "hoy" : "mañana"} ${String(slot[0]).padStart(2, "0")}:${String(slot[1]).padStart(2, "0")}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
