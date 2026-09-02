#!/usr/bin/env node
// Refreshes Restaurante Demo so it always looks "alive" — busy floor right
// now, a spread of upcoming reservations, a couple of pending requests
// waiting on approval (no table yet), and a couple of people on the
// waitlist. Run this whenever the demo looks stale (all reservations from
// a previous day, "hoy" showing zeros).
//
// Uso:
//   pnpm run seed:refresh
//
// Lee SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY desde supabase/seed/.env
// (ya está armado con las credenciales de este proyecto — no hace falta
// tocarlo). Si preferís no guardar la service role key en un archivo,
// podés exportarlas vos mismo en la terminal en vez de tener el .env:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed/refresh.mjs
//
// No es idempotente a propósito -- cada corrida agrega actividad nueva
// relativa a "ahora", que es exactamente el punto. Los datos viejos no
// molestan, simplemente dejan de aparecer en las vistas de "hoy".

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

// Reservas reales siempre caen en la grilla de 30 min (14:00, 14:30, 15:00...)
// -- nunca a las 17:08. Los walk-in son la única excepción: llegan cuando
// llegan, no reservaron nada.
const SLOT_MS = 30 * 60_000;
function snapToSlot(date) {
  return new Date(Math.round(date.getTime() / SLOT_MS) * SLOT_MS);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

  const tables = await rest(`tables?restaurant_id=eq.${restaurantId}&active=eq.true&select=id,name,capacity_max&order=name`);
  const shuffled = shuffle(tables);
  const now = Date.now();

  // --- Mesas ocupadas ahora (~60%) ---
  const seatedCount = Math.round(tables.length * 0.6);
  const seatedTables = shuffled.slice(0, seatedCount);
  const freeTables = shuffled.slice(seatedCount);

  for (const table of seatedTables) {
    const { firstName, lastName } = randomName();
    const customer = await createCustomer(restaurantId, firstName, lastName);
    const isWalkIn = Math.random() < 0.5;
    const startedMinutesAgo = 10 + Math.floor(Math.random() * 90);
    const durationMinutes = 75 + Math.floor(Math.random() * 45);
    // Walk-ins sat down whenever they showed up; everyone else booked a slot.
    const startsAt = isWalkIn ? new Date(now - startedMinutesAgo * 60_000) : snapToSlot(new Date(now - startedMinutesAgo * 60_000));
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const partySize = Math.max(1, table.capacity_max - (Math.random() < 0.4 ? 1 : 0) - (Math.random() < 0.2 ? 1 : 0));

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
  }

  // --- Reservas confirmadas más tarde (algunas reusan mesas que van a girar) ---
  const upcomingSlots = 14;
  const allTablesForUpcoming = shuffle([...seatedTables, ...freeTables, ...seatedTables]);
  for (let i = 0; i < upcomingSlots; i++) {
    const table = allTablesForUpcoming[i % allTablesForUpcoming.length];
    const { firstName, lastName } = randomName();
    const customer = await createCustomer(restaurantId, firstName, lastName);
    const minutesFromNow = 30 + i * 20 + Math.floor(Math.random() * 15);
    const durationMinutes = 75 + Math.floor(Math.random() * 45);
    const startsAt = snapToSlot(new Date(now + minutesFromNow * 60_000));
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const partySize = Math.max(1, table.capacity_max - (Math.random() < 0.4 ? 1 : 0));
    const status = minutesFromNow <= 20 ? "arriving" : "confirmed";
    const source = ["public_portal", "admin", "phone"][Math.floor(Math.random() * 3)];

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
    `Listo: ${seatedTables.length} mesas sentadas ahora, ${upcomingSlots} reservas confirmadas más tarde, ` +
      `${pendingSlots.length} solicitudes pendientes sin mesa, ${waitlistCount} en lista de espera.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
