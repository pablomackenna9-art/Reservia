#!/usr/bin/env node
// Resetea y repuebla Restaurante Demo así siempre se ve "vivo": borra toda
// la actividad anterior (reservas, clientes, lista de espera) y genera todo
// de nuevo relativo a "ahora" -- sin eso, cada corrida se sumaba sobre la
// anterior y terminaba con horarios viejos e inconsistentes mezclados con
// los nuevos. Correr cuando el demo se vea vacío o desactualizado.
//
// Uso:
//   pnpm run seed:refresh
//
// Lee SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY desde supabase/seed/.env
// (ya está armado con las credenciales de este proyecto). Si preferís no
// guardar la service role key en un archivo, exportalas vos mismo:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed/refresh.mjs
//
// Reglas de coherencia:
//   - Toda reserva real (pendiente, confirmada, o sentada por 'admin') cae
//     en la grilla de 30 min -- nunca a las 17:08. Varias mesas distintas
//     sí pueden compartir el mismo horario, eso es normal.
//   - Los walk-in son la única excepción horaria: llegaron cuando llegaron.
//   - Ninguna mesa recibe dos reservas que se pisen en el tiempo -- se
//     respeta un colchón de 15 min entre una y la siguiente, igual que el
//     buffer real del motor de disponibilidad.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (en supabase/seed/.env o exportadas en el entorno).");
  process.exit(1);
}

const headers = { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const FIRST_NAMES = [
  "María", "Roberto", "Ana", "Diego", "Isabel", "Javier", "Carla", "Francisca", "Matías", "Camila",
  "Tomás", "Valentina", "Sebastián", "Antonia", "Cristóbal", "Josefa", "Nicolás", "Fernanda", "Ignacio",
  "Constanza", "Benjamín", "Trinidad", "Vicente", "Florencia", "Agustín", "Emilia", "Maximiliano",
  "Renata", "Joaquín", "Amanda",
];
const LAST_NAMES = [
  "González", "Núñez", "Pérez", "Ramírez", "Silva", "Morales", "Fuentes", "Soto", "Rojas", "Vidal",
  "Bravo", "Castro", "Muñoz", "Reyes", "Vega", "Contreras", "Espinoza", "Torres", "Salazar", "Molina",
  "Araya", "Cortés", "Herrera", "Guzmán", "Pizarro", "Sepúlveda", "Flores", "Cárdenas", "Farías", "Lagos",
];

function randomName() {
  return {
    firstName: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)],
    lastName: LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)],
  };
}

function randomPhone() {
  return "+569" + String(Math.floor(10000000 + Math.random() * 89999999));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Reservas reales siempre caen en la grilla de 30 min (14:00, 14:30, 15:00...).
const SLOT_MS = 30 * 60_000;
function snapToSlot(date) {
  return new Date(Math.round(date.getTime() / SLOT_MS) * SLOT_MS);
}

// Colchón entre reservas de la misma mesa -- misma idea que bufferMinutes.
const BUFFER_MS = 15 * 60_000;

async function createCustomer(restaurantId, firstName, lastName) {
  const [customer] = await rest("customers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ restaurant_id: restaurantId, first_name: firstName, last_name: lastName, phone: randomPhone() }),
  });
  return customer;
}

async function main() {
  const [restaurant] = await rest(`restaurants?slug=eq.restaurante-demo&select=id,created_by`);
  if (!restaurant) throw new Error("restaurante-demo not found — corré primero supabase/seed/demo.mjs");
  const restaurantId = restaurant.id;
  const ownerId = restaurant.created_by;

  // --- Reset: nunca acumular sobre corridas anteriores. reservations y
  // waitlist_entries van antes que customers porque ambas la referencian
  // con "on delete restrict".
  console.log("Limpiando actividad anterior...");
  await rest(`reservations?restaurant_id=eq.${restaurantId}`, { method: "DELETE" });
  await rest(`waitlist_entries?restaurant_id=eq.${restaurantId}`, { method: "DELETE" });
  await rest(`customers?restaurant_id=eq.${restaurantId}`, { method: "DELETE" });

  const tables = await rest(
    `tables?restaurant_id=eq.${restaurantId}&active=eq.true&select=id,name,capacity_max&order=name`,
  );
  const now = Date.now();

  // tableId -> [[startMs, endMs], ...] -- para que ninguna mesa termine con
  // dos reservas que se pisen en el tiempo.
  const bookings = new Map();
  function overlaps(tableId, startMs, endMs) {
    const list = bookings.get(tableId);
    if (!list) return false;
    return list.some(([s, e]) => startMs < e + BUFFER_MS && endMs + BUFFER_MS > s);
  }
  function book(tableId, startMs, endMs) {
    if (!bookings.has(tableId)) bookings.set(tableId, []);
    bookings.get(tableId).push([startMs, endMs]);
  }

  let created = 0;

  // --- Mesas ocupadas ahora (~60%) -- una reserva por mesa, sin riesgo de choque acá. ---
  const seatedCount = Math.round(tables.length * 0.6);
  const shuffledTables = shuffle(tables);
  const seatedTables = shuffledTables.slice(0, seatedCount);
  const freeTables = shuffledTables.slice(seatedCount);

  for (const table of seatedTables) {
    const { firstName, lastName } = randomName();
    const customer = await createCustomer(restaurantId, firstName, lastName);
    const isWalkIn = Math.random() < 0.5;
    const startedMinutesAgo = 10 + Math.floor(Math.random() * 90);
    const durationMinutes = 75 + Math.floor(Math.random() * 45);
    // Walk-ins sat down whenever they showed up; everyone else booked a slot.
    const startsAt = isWalkIn
      ? new Date(now - startedMinutesAgo * 60_000)
      : snapToSlot(new Date(now - startedMinutesAgo * 60_000));
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const partySize = Math.max(1, table.capacity_max - (Math.random() < 0.4 ? 1 : 0) - (Math.random() < 0.2 ? 1 : 0));

    book(table.id, startsAt.getTime(), endsAt.getTime());
    await rest("reservations", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: restaurantId,
        customer_id: customer.id,
        table_id: table.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: partySize,
        status: "seated",
        source: isWalkIn ? "walk_in" : "admin",
        created_by: ownerId,
      }),
    });
    created++;
  }

  // --- Reservas confirmadas más tarde -- se busca una mesa realmente libre
  // para ese horario antes de asignar, no cualquiera. ---
  const upcomingSlots = 14;
  for (let i = 0; i < upcomingSlots; i++) {
    const minutesFromNow = 30 + i * 20 + Math.floor(Math.random() * 15);
    const startsAt = snapToSlot(new Date(now + minutesFromNow * 60_000));
    const durationMinutes = 75 + Math.floor(Math.random() * 45);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    const table = shuffle([...seatedTables, ...freeTables]).find(
      (t) => !overlaps(t.id, startsAt.getTime(), endsAt.getTime()),
    );
    if (!table) continue; // ninguna mesa libre para ese horario -- se salta, no se fuerza un choque

    const partySize = Math.max(1, table.capacity_max - (Math.random() < 0.4 ? 1 : 0));
    const status = minutesFromNow <= 20 ? "arriving" : "confirmed";
    const source = ["public_portal", "admin", "phone"][Math.floor(Math.random() * 3)];
    const { firstName, lastName } = randomName();
    const customer = await createCustomer(restaurantId, firstName, lastName);

    book(table.id, startsAt.getTime(), endsAt.getTime());
    await rest("reservations", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: restaurantId,
        customer_id: customer.id,
        table_id: table.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: partySize,
        status,
        source,
        created_by: ownerId,
      }),
    });
    created++;
  }

  // --- Solicitudes pendientes sin mesa (portal público, esperando aprobación) ---
  const pendingSlots = [
    { minutesFromNow: 150, partySize: 2 },
    { minutesFromNow: 300, partySize: 5, notes: "Cumpleaños, si se puede mesa tranquila" },
  ];
  for (const slot of pendingSlots) {
    const { firstName, lastName } = randomName();
    const customer = await createCustomer(restaurantId, firstName, lastName);
    const startsAt = snapToSlot(new Date(now + slot.minutesFromNow * 60_000));
    const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
    await rest("reservations", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: restaurantId,
        customer_id: customer.id,
        table_id: null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: slot.partySize,
        status: "pending",
        source: "public_portal",
        notes: slot.notes ?? null,
      }),
    });
    created++;
  }

  // --- Lista de espera ---
  const waitlistCount = 2;
  for (let i = 0; i < waitlistCount; i++) {
    const { firstName, lastName } = randomName();
    const customer = await createCustomer(restaurantId, firstName, lastName);
    await rest("waitlist_entries", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: restaurantId,
        customer_id: customer.id,
        party_size: 2 + Math.floor(Math.random() * 4),
        status: "waiting",
      }),
    });
  }

  console.log(
    `Listo: ${seatedTables.length} mesas sentadas ahora, ${created - seatedTables.length - pendingSlots.length} ` +
      `reservas confirmadas más tarde, ${pendingSlots.length} solicitudes pendientes sin mesa, ${waitlistCount} en lista de espera.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
