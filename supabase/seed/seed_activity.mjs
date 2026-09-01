#!/usr/bin/env node
// Populates Restaurante Demo with realistic activity relative to "right
// now": ~60% of tables seated, plus a spread of confirmed reservations
// over the next several hours. Not idempotent like demo.mjs — running it
// twice adds more reservations on top, since the whole point is "make it
// look busy right now" and "now" keeps changing. Safe to re-run whenever
// the demo data looks stale (e.g. all the seed reservations are in the past).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed/seed_activity.mjs

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
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
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return { firstName: first, lastName: last };
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

async function main() {
  const [restaurant] = await rest(`restaurants?slug=eq.restaurante-demo&select=id,created_by`);
  if (!restaurant) throw new Error("restaurante-demo not found");
  const restaurantId = restaurant.id;
  const ownerId = restaurant.created_by;

  const tables = await rest(`tables?restaurant_id=eq.${restaurantId}&active=eq.true&select=id,name,capacity_max&order=name`);
  const shuffled = shuffle(tables);

  const now = Date.now();
  const seatedCount = Math.round(tables.length * 0.6); // ~60% occupied right now
  const seatedTables = shuffled.slice(0, seatedCount);
  const freeTables = shuffled.slice(seatedCount);

  let created = 0;

  // Seated now — staggered start times over the last ~100 minutes so it
  // doesn't look like everyone sat down at the exact same second.
  for (const table of seatedTables) {
    const { firstName, lastName } = randomName();
    const customer = await rest("customers", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ restaurant_id: restaurantId, first_name: firstName, last_name: lastName, phone: randomPhone() }),
    });
    const startedMinutesAgo = 10 + Math.floor(Math.random() * 90);
    const durationMinutes = 75 + Math.floor(Math.random() * 45);
    const startsAt = new Date(now - startedMinutesAgo * 60_000);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const partySize = Math.max(1, table.capacity_max - (Math.random() < 0.4 ? 1 : 0) - (Math.random() < 0.2 ? 1 : 0));

    await rest("reservations", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: restaurantId,
        customer_id: customer[0].id,
        table_id: table.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: partySize,
        status: "seated",
        source: Math.random() < 0.5 ? "walk_in" : "admin",
        created_by: ownerId,
      }),
    });
    created++;
  }

  // Upcoming over the next ~5 hours — some on tables that are occupied now
  // (they'll turn over) and some on tables that are free all along.
  const upcomingSlots = 14;
  const allTablesForUpcoming = shuffle([...seatedTables, ...freeTables, ...seatedTables]); // seated tables weighted more (turnover)
  for (let i = 0; i < upcomingSlots; i++) {
    const table = allTablesForUpcoming[i % allTablesForUpcoming.length];
    const { firstName, lastName } = randomName();
    const customer = await rest("customers", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ restaurant_id: restaurantId, first_name: firstName, last_name: lastName, phone: randomPhone() }),
    });
    const minutesFromNow = 30 + i * 20 + Math.floor(Math.random() * 15);
    const durationMinutes = 75 + Math.floor(Math.random() * 45);
    const startsAt = new Date(now + minutesFromNow * 60_000);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const partySize = Math.max(1, table.capacity_max - (Math.random() < 0.4 ? 1 : 0));
    const status = minutesFromNow <= 20 ? "arriving" : Math.random() < 0.15 ? "pending" : "confirmed";
    const source = ["public_portal", "admin", "phone"][Math.floor(Math.random() * 3)];

    await rest("reservations", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: restaurantId,
        customer_id: customer[0].id,
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

  console.log(`Listo: ${seatedTables.length} mesas sentadas ahora, ${upcomingSlots} reservas mas tarde. Total: ${created} reservas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
