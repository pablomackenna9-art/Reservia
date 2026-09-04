#!/usr/bin/env node
// Refresca la actividad "en vivo" de Restaurante Demo -- reservas de hoy en
// adelante y lista de espera -- sin tocar nunca a los clientes ni su
// historial de consumo, que se acumulan día a día.
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
//
// Clientes: NUNCA se borran. Cada corrida reutiliza el pool existente la
// mayoría de las veces (en vez de inventar gente nueva siempre), así los
// clientes van acumulando visitas, consumo total y productos favoritos
// reales en vez de perder todo cada día. Solo se borra actividad transitoria
// (reservas no completadas -- pendientes/confirmadas/sentadas/etc. de
// corridas anteriores -- y la lista de espera). Las reservas 'completed' son
// historial real y jamás se tocan.

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

// Menú de referencia para generar consumo realista (visitas -> cuenta ->
// productos) -- alimenta "consumo total" y "productos favoritos" por cliente.
const MENU = [
  { name: "Empanada de pino", category: "Entradas", price: 3500 },
  { name: "Ceviche de reineta", category: "Entradas", price: 8500 },
  { name: "Tabla de quesos", category: "Entradas", price: 9500 },
  { name: "Pastel de choclo", category: "Principales", price: 9500 },
  { name: "Lomo a lo pobre", category: "Principales", price: 12500 },
  { name: "Congrio frito", category: "Principales", price: 13500 },
  { name: "Cazuela de vacuno", category: "Principales", price: 9000 },
  { name: "Pique macho", category: "Principales", price: 14000 },
  { name: "Papas fritas", category: "Acompañamientos", price: 3500 },
  { name: "Ensalada chilena", category: "Acompañamientos", price: 3000 },
  { name: "Copa de vino Carmenère", category: "Bebidas", price: 5000 },
  { name: "Pisco Sour", category: "Bebidas", price: 5500 },
  { name: "Cerveza artesanal", category: "Bebidas", price: 4500 },
  { name: "Jugo natural", category: "Bebidas", price: 3000 },
  { name: "Mote con huesillo", category: "Postres", price: 3500 },
  { name: "Leche asada", category: "Postres", price: 4000 },
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

function randomEmail(firstName, lastName) {
  const slug = `${firstName}.${lastName}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `${slug}${Math.floor(Math.random() * 900 + 100)}@example.com`;
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

async function createNewCustomer(restaurantId) {
  const { firstName, lastName } = randomName();
  const [customer] = await rest("customers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      restaurant_id: restaurantId,
      first_name: firstName,
      last_name: lastName,
      phone: randomPhone(),
      email: randomEmail(firstName, lastName),
    }),
  });
  return customer;
}

/**
 * Devuelve un cliente para usar en una nueva reserva/visita -- la mayoría de
 * las veces reutiliza a alguien del pool existente (así acumula visitas e
 * historial real), y de vez en cuando crea a alguien nuevo. `pool` se
 * actualiza in-place para que las corridas dentro de la misma ejecución
 * también puedan reutilizar a los recién creados.
 */
async function pickCustomer(restaurantId, pool, reuseChance = 0.65) {
  if (pool.length > 0 && Math.random() < reuseChance) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const created = await createNewCustomer(restaurantId);
  pool.push(created);
  return created;
}

/** Arma y guarda una visita + cuenta + ítems de consumo real para un cliente -- devuelve el total. */
async function recordConsumption(restaurantId, customerId, tableId, startsAt, endsAt, partySize) {
  const [visit] = await rest("visits", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      restaurant_id: restaurantId,
      table_id: tableId,
      customer_id: customerId,
      party_size: partySize,
      started_at: startsAt.toISOString(),
      ended_at: endsAt.toISOString(),
      status: "closed",
    }),
  });

  const itemCount = 2 + Math.floor(Math.random() * 3); // 2 a 4 productos
  const picks = shuffle(MENU).slice(0, itemCount);
  let total = 0;
  const items = picks.map((item) => {
    const quantity = 1 + (Math.random() < 0.25 ? 1 : 0);
    const lineTotal = item.price * quantity;
    total += lineTotal;
    return {
      name: item.name,
      category: item.category,
      quantity,
      unit_price: item.price,
      total: lineTotal,
    };
  });

  const [check] = await rest("pos_checks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      restaurant_id: restaurantId,
      visit_id: visit.id,
      external_check_id: `seed-${visit.id}`,
      external_table_id: tableId,
      opened_at: startsAt.toISOString(),
      closed_at: endsAt.toISOString(),
      subtotal: total,
      total,
      paid_amount: total,
      guest_count: partySize,
      status: "closed",
    }),
  });

  await rest("pos_check_items", {
    method: "POST",
    body: JSON.stringify(items.map((item) => ({ restaurant_id: restaurantId, check_id: check.id, ...item }))),
  });

  return total;
}

async function main() {
  const [restaurant] = await rest(`restaurants?slug=eq.restaurante-demo&select=id,created_by`);
  if (!restaurant) throw new Error("restaurante-demo not found — corré primero supabase/seed/demo.mjs");
  const restaurantId = restaurant.id;
  const ownerId = restaurant.created_by;

  // --- Reset: solo actividad transitoria. 'completed' es historial real y
  // nunca se borra; los clientes tampoco.
  console.log("Limpiando actividad transitoria (no toca clientes ni historial completado)...");
  await rest(`reservations?restaurant_id=eq.${restaurantId}&status=neq.completed`, { method: "DELETE" });
  await rest(`waitlist_entries?restaurant_id=eq.${restaurantId}`, { method: "DELETE" });

  const customerPool = await rest(
    `customers?restaurant_id=eq.${restaurantId}&select=id,first_name,last_name,total_visits`,
  );

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
    const customer = await pickCustomer(restaurantId, customerPool);
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

  // --- Curva de ocupación de la noche: a las 19:30 ~15% del restaurante
  // reservado, a las 20:00 ~85-90%. No es azar disperso -- se apunta a esos
  // dos números explícitamente, mesa por mesa, respetando la disponibilidad
  // real (nunca se fuerza un choque). Si "ahora" ya pasó esas horas hoy,
  // apunta a las mismas horas de mañana, para que el refresh sirva sin
  // importar a qué hora del día se corra.
  function targetClockTime(hour, minute) {
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function occupiedTablesAt(targetMs) {
    let count = 0;
    for (const list of bookings.values()) {
      if (list.some(([s, e]) => s <= targetMs && e + BUFFER_MS > targetMs)) count++;
    }
    return count;
  }

  const DINNER_CHECKPOINTS = [
    { hour: 19, minute: 30, targetPct: 0.15 },
    { hour: 20, minute: 0, targetPct: 0.875 }, // punto medio de 85-90%
  ];

  let dinnerCurveCreated = 0;
  for (const { hour, minute, targetPct } of DINNER_CHECKPOINTS) {
    const targetMs = targetClockTime(hour, minute);
    const targetCount = Math.round(tables.length * targetPct);
    let guard = 0;
    while (occupiedTablesAt(targetMs) < targetCount && guard < tables.length * 3) {
      guard++;
      const durationMinutes = 75 + Math.floor(Math.random() * 45);
      const startsAt = new Date(targetMs);
      const endsAt = new Date(targetMs + durationMinutes * 60_000);
      const table = shuffle(tables).find((t) => !overlaps(t.id, startsAt.getTime(), endsAt.getTime()));
      if (!table) break; // ninguna mesa sirve ya para esa hora -- se corta, no se fuerza

      const partySize = Math.max(1, table.capacity_max - (Math.random() < 0.4 ? 1 : 0));
      const status = startsAt.getTime() - now <= 20 * 60_000 ? "arriving" : "confirmed";
      const source = ["public_portal", "admin", "phone"][Math.floor(Math.random() * 3)];
      const customer = await pickCustomer(restaurantId, customerPool);

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
      dinnerCurveCreated++;
    }
  }

  // --- Después de las 20:00 la gente sigue queriendo reservar. Acá está lo
  // importante: si ya no queda ninguna mesa que sirva para ese horario, NO
  // se fuerza un choque -- la solicitud cae a pendiente sin mesa (para que
  // el staff decida en Notificaciones) o directo a lista de espera (a veces
  // con prioridad), mostrando los dos caminos reales de "no hay disponibilidad".
  const laterAttempts = [
    { hour: 20, minute: 30 },
    { hour: 21, minute: 0 },
    { hour: 21, minute: 30 },
    { hour: 22, minute: 0 },
  ];
  let waitlistFromCapacity = 0;
  let pendingFromCapacity = 0;
  let laterConfirmed = 0;
  for (const { hour, minute } of laterAttempts) {
    const targetMs = targetClockTime(hour, minute);
    const durationMinutes = 75 + Math.floor(Math.random() * 45);
    const startsAt = new Date(targetMs);
    const endsAt = new Date(targetMs + durationMinutes * 60_000);
    const table = shuffle(tables).find((t) => !overlaps(t.id, startsAt.getTime(), endsAt.getTime()));
    const customer = await pickCustomer(restaurantId, customerPool);
    const partySize = 2 + Math.floor(Math.random() * 4);

    if (table) {
      book(table.id, startsAt.getTime(), endsAt.getTime());
      await rest("reservations", {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_id: customer.id,
          table_id: table.id,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          party_size: Math.max(1, table.capacity_max - 1),
          status: "confirmed",
          source: "public_portal",
          created_by: ownerId,
        }),
      });
      created++;
      laterConfirmed++;
    } else if (Math.random() < 0.5) {
      await rest("reservations", {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_id: customer.id,
          table_id: null,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          party_size: partySize,
          status: "pending",
          source: "public_portal",
          notes: "Sin mesa disponible a esa hora al momento de la solicitud",
        }),
      });
      pendingFromCapacity++;
      created++;
    } else {
      await rest("waitlist_entries", {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_id: customer.id,
          party_size: partySize,
          status: "waiting",
          priority: Math.random() < 0.25 ? 1 : 0,
        }),
      });
      waitlistFromCapacity++;
    }
  }

  // --- Solicitudes pendientes sin mesa (portal público, esperando aprobación) ---
  const pendingSlots = [
    { minutesFromNow: 150, partySize: 2 },
    { minutesFromNow: 300, partySize: 5, notes: "Cumpleaños, si se puede mesa tranquila" },
  ];
  for (const slot of pendingSlots) {
    const customer = await pickCustomer(restaurantId, customerPool);
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
    const customer = await pickCustomer(restaurantId, customerPool);
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

  // --- Historial de consumo: un puñado de visitas ya completadas y pagadas,
  // repartidas en los últimos 30 días, mayoritariamente sobre clientes que ya
  // existen -- esto es lo que hace crecer "consumo total" y "productos
  // favoritos" de cada cliente con el tiempo, en vez de perderse cada día.
  const historicalVisits = 6;
  let historicalTotal = 0;
  for (let i = 0; i < historicalVisits; i++) {
    const customer = await pickCustomer(restaurantId, customerPool, 0.8);
    const table = tables[Math.floor(Math.random() * tables.length)];
    const daysAgo = 1 + Math.floor(Math.random() * 30);
    const hour = 13 + Math.floor(Math.random() * 8); // 13:00–20:00
    const startsAt = new Date(now - daysAgo * 24 * 60 * 60_000);
    startsAt.setHours(hour, Math.random() < 0.5 ? 0 : 30, 0, 0);
    const durationMinutes = 75 + Math.floor(Math.random() * 45);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const partySize = Math.max(1, (table?.capacity_max ?? 4) - (Math.random() < 0.4 ? 1 : 0));

    const total = await recordConsumption(restaurantId, customer.id, table?.id ?? null, startsAt, endsAt, partySize);
    historicalTotal += total;

    await rest("reservations", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: restaurantId,
        customer_id: customer.id,
        table_id: table?.id ?? null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: partySize,
        status: "completed",
        source: "admin",
        total_amount: total,
        created_by: ownerId,
      }),
    });

    // Insertar directo en 'completed' no dispara handle_reservation_status_change
    // (esa trigger reacciona a un *cambio* de estado, no a un insert ya en su
    // estado final) -- así que replicamos a mano lo que haría: sumar la
    // visita y actualizar la última visita del cliente.
    customer.total_visits = (customer.total_visits ?? 0) + 1;
    await rest(`customers?id=eq.${customer.id}`, {
      method: "PATCH",
      body: JSON.stringify({ total_visits: customer.total_visits, last_visit_at: endsAt.toISOString() }),
    });
  }

  console.log(
    `Listo: ${seatedTables.length} mesas sentadas ahora, ${dinnerCurveCreated} reservas armando la curva de la noche ` +
      `(19:30 ~15%, 20:00 ~85-90%), ${laterConfirmed} confirmadas más tarde con mesa real, ` +
      `${pendingFromCapacity + pendingSlots.length} solicitudes pendientes sin mesa, ` +
      `${waitlistCount + waitlistFromCapacity} en lista de espera (${waitlistFromCapacity} por falta de capacidad), ` +
      `${historicalVisits} visitas de historial agregadas (~$${historicalTotal.toLocaleString("es-CL")} en consumo nuevo). ` +
      `${customerPool.length} clientes en el pool (se reutilizan, nunca se borran).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
