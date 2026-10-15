import { useEffect, useState } from "react";
import {
  createCustomer,
  getAveragePurchaseByCustomer,
  getCustomerConsumptionStats,
  listCustomers,
  setCustomerBlacklisted,
  updateCustomer,
  type CustomerConsumptionStats,
} from "@reservia/api-client";
import { customerFullName, type Customer } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { Tag } from "../../components/ui";

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

export function ClientesPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [avgPurchase, setAvgPurchase] = useState<Map<string, number>>(new Map());
  const [consumption, setConsumption] = useState<Map<string, CustomerConsumptionStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBlockForm, setShowBlockForm] = useState(false);

  async function reload() {
    if (!restaurantId) return;
    const [c, avg, cons] = await Promise.all([
      listCustomers(supabase, restaurantId),
      getAveragePurchaseByCustomer(supabase, restaurantId),
      getCustomerConsumptionStats(supabase, restaurantId),
    ]);
    setCustomers(c);
    setAvgPurchase(avg);
    setConsumption(cons);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const filtered = customers.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return customerFullName(c).toLowerCase().includes(q) || (c.phone ?? "").includes(q) || (c.email ?? "").toLowerCase().includes(q);
  });

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="p-3 sm:p-6 xl:h-[calc(100vh-68px)] flex flex-col">
      <header className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <h1 className="font-serif text-4xl font-normal leading-tight">Clientes</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono o correo…"
            className="w-full sm:w-80 h-11 rounded-[10px] bg-surface border border-line px-3 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent"
          />
          <button
            onClick={() => setShowBlockForm(true)}
            disabled={!restaurantId}
            className="h-11 rounded-[10px] bg-status-occupied/15 border border-status-occupied/45 text-status-occupied px-4 text-[15px] font-semibold disabled:opacity-60 shrink-0"
          >
            🚫 Bloquear a alguien
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex gap-4">
        <div className="flex-1 min-w-0 xl:rounded-2xl xl:bg-surface xl:overflow-y-auto">
          {loading ? (
            <p className="p-4 text-[15px] text-ink-muted">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-[15px] text-ink-muted">
              {customers.length === 0 ? "Todavía no hay clientes registrados." : "Sin resultados."}
            </p>
          ) : (
            <>
            {/* Celular y tablet: una tarjeta por cliente, con los datos a la vista (sin tabla que se corte). */}
            <ul className="xl:hidden space-y-3">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="w-full text-left rounded-2xl bg-surface p-4 active:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[17px] font-semibold leading-snug">{customerFullName(c)}</p>
                      <span className="text-[13px] text-ink-faint shrink-0 pt-0.5">{formatDate(c.lastVisitAt)}</span>
                    </div>
                    {(c.totalVisits >= 5 || c.noShowCount >= 2 || c.blacklisted) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {c.totalVisits >= 5 && <Tag tone="accent">Frecuente</Tag>}
                        {c.noShowCount >= 2 && <Tag tone="danger">Riesgo no-show</Tag>}
                        {c.blacklisted && <Tag tone="danger">🚫 Bloqueado</Tag>}
                      </div>
                    )}
                    <p className="text-[15px] text-ink-muted mt-2">{c.phone ?? "Sin teléfono"}</p>
                    <p className="text-[15px] text-ink-muted break-all">{c.email ?? "Sin correo"}</p>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <CardStat label="Visitas" value={String(c.totalVisits)} />
                      <CardStat label="No-shows" value={String(c.noShowCount)} alert={c.noShowCount > 0} />
                      <CardStat
                        label="Consumo"
                        value={consumption.has(c.id) ? formatCLP(consumption.get(c.id)!.totalSpent) : "—"}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <table className="hidden xl:table w-full text-sm">
              <thead>
                <tr className="border-b border-line text-[13px] text-ink-faint uppercase tracking-wide">
                  <th className="text-left font-normal px-4 py-2.5">Nombre</th>
                  <th className="text-left font-normal px-4 py-2.5">Contacto</th>
                  <th className="text-left font-normal px-4 py-2.5">Mail</th>
                  <th className="text-right font-normal px-4 py-2.5">Visitas</th>
                  <th className="text-right font-normal px-4 py-2.5">No-shows</th>
                  <th className="text-right font-normal px-4 py-2.5">Promedio compra</th>
                  <th className="text-right font-normal px-4 py-2.5">Consumo total</th>
                  <th className="text-left font-normal px-4 py-2.5">Última visita</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={c.id === selectedId}
                    onClick={() => setSelectedId(c.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedId(c.id))}
                    className={`border-b border-line last:border-0 cursor-pointer hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                      c.id === selectedId ? "bg-surface-2" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {customerFullName(c)}
                        {c.totalVisits >= 5 && (
                          <span className="text-[13px] rounded-full px-1.5 py-0.5 bg-accent/15 text-accent border border-accent/40">
                            Frecuente
                          </span>
                        )}
                        {c.noShowCount >= 2 && (
                          <span className="text-[13px] rounded-full px-1.5 py-0.5 text-status-occupied border border-status-occupied/40">
                            Riesgo no-show
                          </span>
                        )}
                        {c.blacklisted && (
                          <span className="text-[13px] rounded-full px-1.5 py-0.5 bg-status-occupied/15 text-status-occupied border border-status-occupied/40">
                            🚫 Bloqueado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-faint">{c.phone ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-faint">{c.email ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.totalVisits}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.noShowCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-faint">
                      {avgPurchase.has(c.id) ? formatCLP(avgPurchase.get(c.id)!) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {consumption.has(c.id) ? formatCLP(consumption.get(c.id)!.totalSpent) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-faint">{formatDate(c.lastVisitAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>

        {selected && (
          <CustomerDetailPanel
            customer={selected}
            averagePurchase={avgPurchase.get(selected.id) ?? null}
            consumption={consumption.get(selected.id) ?? null}
            onClose={() => setSelectedId(null)}
            onSaved={(updated) => {
              setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            }}
          />
        )}
      </div>

      {showBlockForm && restaurantId && (
        <BlockPersonForm
          restaurantId={restaurantId}
          onCancel={() => setShowBlockForm(false)}
          onBlocked={(customer) => {
            setShowBlockForm(false);
            setCustomers((prev) => [customer, ...prev]);
            setSelectedId(customer.id);
          }}
        />
      )}
    </div>
  );
}

function CustomerDetailPanel({
  customer,
  averagePurchase,
  consumption,
  onClose,
  onSaved,
}: {
  customer: Customer;
  averagePurchase: number | null;
  consumption: CustomerConsumptionStats | null;
  onClose: () => void;
  onSaved: (c: Customer) => void;
}) {
  const [lastName, setLastName] = useState(customer.lastName ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [birthday, setBirthday] = useState(customer.birthday ?? "");
  const [blacklistReason, setBlacklistReason] = useState(customer.blacklistedReason ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updated = await updateCustomer(supabase, customer.id, {
      lastName: lastName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      birthday: birthday.trim() || null,
    });
    setSaving(false);
    onSaved(updated);
  }

  async function handleToggleBlacklist(blacklisted: boolean) {
    await setCustomerBlacklisted(supabase, customer.id, blacklisted, blacklistReason.trim() || null);
    onSaved({ ...customer, blacklisted, blacklistedReason: blacklisted ? blacklistReason.trim() || null : null });
  }

  return (
    <aside className="fixed inset-0 z-40 bg-ground overflow-y-auto p-4 xl:static xl:inset-auto xl:z-auto xl:w-80 xl:shrink-0 xl:rounded-2xl xl:bg-surface">
      <div className="sticky top-0 -mx-4 -mt-4 mb-4 px-4 py-3 flex items-center justify-between bg-ground xl:bg-surface xl:static xl:m-0 xl:p-0 xl:mb-4 xl:items-start z-10">
        <h2 className="font-serif text-[32px] leading-none xl:text-lg xl:font-sans xl:font-semibold">{customer.firstName}</h2>
        <button
          onClick={onClose}
          className="h-11 px-4 rounded-[10px] bg-surface-2 text-[15px] font-semibold xl:h-9 xl:w-9 xl:px-0 xl:text-ink-muted"
          aria-label="Cerrar"
        >
          <span className="xl:hidden">✕ Cerrar</span>
          <span className="hidden xl:inline">✕</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <MiniStat label="Visitas" value={customer.totalVisits} />
        <MiniStat label="No-shows" value={customer.noShowCount} />
        <MiniStat label="Cancelaciones" value={customer.cancellationCount} />
        <MiniStat label="Promedio compra" value={averagePurchase != null ? formatCLP(averagePurchase) : "—"} />
        <MiniStat label="Consumo total" value={consumption ? formatCLP(consumption.totalSpent) : "—"} />
      </div>

      {consumption && consumption.topProducts.length > 0 && (
        <div className="rounded-lg border border-line bg-ground p-3 mb-4">
          <p className="text-[13px] text-ink-faint uppercase tracking-wide mb-2">Productos favoritos</p>
          <ul className="space-y-1">
            {consumption.topProducts.map((p) => (
              <li key={p.name} className="flex items-center justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className="text-[13px] text-ink-faint tabular-nums shrink-0 ml-2">×{p.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-line bg-ground p-3 mb-4 space-y-2">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={customer.blacklisted}
            onChange={(e) => handleToggleBlacklist(e.target.checked)}
          />
          <span className={customer.blacklisted ? "text-status-occupied font-medium" : ""}>
            🚫 No aceptar reservas de este cliente (portal público)
          </span>
        </label>
        {customer.blacklisted ? (
          <input
            value={blacklistReason}
            onChange={(e) => setBlacklistReason(e.target.value)}
            onBlur={() => handleToggleBlacklist(true)}
            placeholder="Motivo (opcional)"
            className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />
        ) : (
          <p className="text-[13px] text-ink-faint">
            El staff igual puede cargarle una reserva a mano desde el Centro de Control si hace falta.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[13px] text-ink-faint mb-1">Apellido</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-[10px] bg-ground border border-line px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[13px] text-ink-faint mb-1">Teléfono</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-[10px] bg-ground border border-line px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[13px] text-ink-faint mb-1">Correo</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[10px] bg-ground border border-line px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[13px] text-ink-faint mb-1">Cumpleaños</label>
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="w-full rounded-[10px] bg-ground border border-line px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[13px] text-ink-faint mb-1">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Preferencias, alergias, ocasión especial…"
            className="w-full rounded-[10px] bg-ground border border-line px-3 py-2 text-[15px] outline-none focus:border-accent resize-none"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-[10px] bg-accent text-accent-ink h-11 px-[18px] text-[15px] font-semibold disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </aside>
  );
}

function CardStat({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-[10px] bg-surface-2 px-2 py-2 text-center min-w-0">
      <p className={`font-serif text-[22px] leading-none tabular-nums truncate ${alert ? "text-status-occupied" : ""}`}>{value}</p>
      <p className="text-[13px] text-ink-faint mt-1">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[10px] bg-ground border border-line px-2 py-2 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[13px] text-ink-faint">{label}</p>
    </div>
  );
}

/** Blocks someone preemptively -- doesn't require them to have booked before. Phone is what actually gets checked at booking time; name-only entries are a staff-facing reference. */
function BlockPersonForm({
  restaurantId,
  onCancel,
  onBlocked,
}: {
  restaurantId: string;
  onCancel: () => void;
  onBlocked: (customer: Customer) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const customer = await createCustomer(supabase, {
        restaurantId,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      await setCustomerBlacklisted(supabase, customer.id, true, reason.trim() || null);
      onBlocked({ ...customer, blacklisted: true, blacklistedReason: reason.trim() || null });
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : null;
      setError(message ?? "No pudimos bloquear a esta persona.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 px-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-surface p-5">
        <h2 className="text-lg font-semibold mb-1">Bloquear a alguien</h2>
        <p className="text-[13px] text-ink-faint mb-4">
          No va a poder reservar por el portal público. El staff todavía puede cargarle una reserva a mano si hace falta.
        </p>

        <label className="block text-sm text-ink-muted mb-1">Nombre</label>
        <input
          required
          autoFocus
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full mb-3 rounded-[10px] bg-ground border border-line px-3 py-2.5 text-[15px] outline-none focus:border-accent"
        />
        <label className="block text-sm text-ink-muted mb-1">Apellido (opcional)</label>
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full mb-3 rounded-[10px] bg-ground border border-line px-3 py-2.5 text-[15px] outline-none focus:border-accent"
        />
        <label className="block text-sm text-ink-muted mb-1">Teléfono</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="El portal público solo bloquea si hay teléfono cargado"
          className="w-full mb-3 rounded-[10px] bg-ground border border-line px-3 py-2.5 text-[15px] outline-none focus:border-accent"
        />
        <label className="block text-sm text-ink-muted mb-1">Motivo (opcional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="No-shows repetidos, mal comportamiento…"
          className="w-full mb-4 rounded-[10px] bg-ground border border-line px-3 py-2.5 text-[15px] outline-none focus:border-accent"
        />

        {error && <p className="text-sm text-status-occupied mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !firstName.trim()}
            className="rounded-lg bg-status-occupied text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? "Bloqueando…" : "Bloquear"}
          </button>
        </div>
      </div>
    </div>
  );
}
