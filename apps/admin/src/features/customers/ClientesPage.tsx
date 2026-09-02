import { useEffect, useState } from "react";
import { createCustomer, getAveragePurchaseByCustomer, listCustomers, setCustomerBlacklisted, updateCustomer } from "@reservia/api-client";
import { customerFullName, type Customer } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";

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
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBlockForm, setShowBlockForm] = useState(false);

  async function reload() {
    if (!restaurantId) return;
    const [c, avg] = await Promise.all([
      listCustomers(supabase, restaurantId),
      getAveragePurchaseByCustomer(supabase, restaurantId),
    ]);
    setCustomers(c);
    setAvgPurchase(avg);
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
    <div className="p-6 h-screen flex flex-col">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono o correo…"
            className="w-72 rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={() => setShowBlockForm(true)}
            disabled={!restaurantId}
            className="rounded-lg bg-surface-2 border border-status-occupied/40 text-status-occupied px-3 py-2 text-sm font-medium disabled:opacity-60 shrink-0"
          >
            🚫 Bloquear a alguien
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex gap-4">
        <div className="flex-1 min-w-0 rounded-xl border border-line bg-surface overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-ink-muted">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">
              {customers.length === 0 ? "Todavía no hay clientes registrados." : "Sin resultados."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-faint uppercase tracking-wide">
                  <th className="text-left font-normal px-4 py-2.5">Nombre</th>
                  <th className="text-left font-normal px-4 py-2.5">Contacto</th>
                  <th className="text-left font-normal px-4 py-2.5">Mail</th>
                  <th className="text-right font-normal px-4 py-2.5">Visitas</th>
                  <th className="text-right font-normal px-4 py-2.5">No-shows</th>
                  <th className="text-right font-normal px-4 py-2.5">Promedio compra</th>
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
                          <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-accent/15 text-accent border border-accent/40">
                            Frecuente
                          </span>
                        )}
                        {c.noShowCount >= 2 && (
                          <span className="text-[10px] rounded-full px-1.5 py-0.5 text-status-occupied border border-status-occupied/40">
                            Riesgo no-show
                          </span>
                        )}
                        {c.blacklisted && (
                          <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-status-occupied/15 text-status-occupied border border-status-occupied/40">
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
                    <td className="px-4 py-2.5 text-ink-faint">{formatDate(c.lastVisitAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <CustomerDetailPanel
            customer={selected}
            averagePurchase={avgPurchase.get(selected.id) ?? null}
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
  onClose,
  onSaved,
}: {
  customer: Customer;
  averagePurchase: number | null;
  onClose: () => void;
  onSaved: (c: Customer) => void;
}) {
  const [lastName, setLastName] = useState(customer.lastName ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [blacklistReason, setBlacklistReason] = useState(customer.blacklistedReason ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updated = await updateCustomer(supabase, customer.id, {
      lastName: lastName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    onSaved(updated);
  }

  async function handleToggleBlacklist(blacklisted: boolean) {
    await setCustomerBlacklisted(supabase, customer.id, blacklisted, blacklistReason.trim() || null);
    onSaved({ ...customer, blacklisted, blacklistedReason: blacklisted ? blacklistReason.trim() || null : null });
  }

  return (
    <aside className="w-80 shrink-0 rounded-xl border border-line bg-surface p-4 overflow-y-auto">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-lg font-semibold">{customer.firstName}</h2>
        <button onClick={onClose} className="text-ink-faint hover:text-ink text-sm" aria-label="Cerrar">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <MiniStat label="Visitas" value={customer.totalVisits} />
        <MiniStat label="No-shows" value={customer.noShowCount} />
        <MiniStat label="Cancelaciones" value={customer.cancellationCount} />
        <MiniStat label="Promedio compra" value={averagePurchase != null ? formatCLP(averagePurchase) : "—"} />
      </div>

      <div className="rounded-lg border border-line bg-ground p-3 mb-4 space-y-2">
        <label className="flex items-center gap-2 text-xs">
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
            className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-xs outline-none focus:border-accent"
          />
        ) : (
          <p className="text-[10px] text-ink-faint">
            El staff igual puede cargarle una reserva a mano desde el Centro de Control si hace falta.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-ink-faint mb-1">Apellido</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-lg bg-ground border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Teléfono</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg bg-ground border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Correo</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-ground border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Preferencias, alergias, ocasión especial…"
            className="w-full rounded-lg bg-ground border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent resize-none"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-accent text-accent-ink px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </aside>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-ground border border-line px-2 py-2 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-ink-faint">{label}</p>
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold mb-1">Bloquear a alguien</h2>
        <p className="text-xs text-ink-faint mb-4">
          No va a poder reservar por el portal público. El staff todavía puede cargarle una reserva a mano si hace falta.
        </p>

        <label className="block text-sm text-ink-muted mb-1">Nombre</label>
        <input
          required
          autoFocus
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full mb-3 rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <label className="block text-sm text-ink-muted mb-1">Apellido (opcional)</label>
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full mb-3 rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <label className="block text-sm text-ink-muted mb-1">Teléfono</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="El portal público solo bloquea si hay teléfono cargado"
          className="w-full mb-3 rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <label className="block text-sm text-ink-muted mb-1">Motivo (opcional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="No-shows repetidos, mal comportamiento…"
          className="w-full mb-4 rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
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
