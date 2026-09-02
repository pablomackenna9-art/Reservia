import { useEffect, useState } from "react";
import {
  inviteStaffMember,
  listPendingInvitations,
  listTeamMembers,
  removeTeamMember,
  revokeInvitation,
  updateTeamMemberRole,
} from "@reservia/api-client";
import { INVITABLE_ROLES, type InvitableRole, type RestaurantInvitation, type RestaurantRole, type TeamMember } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

const ROLE_LABEL: Record<RestaurantRole, string> = {
  owner: "Dueño",
  administrator: "Administrador",
  host: "Host",
  waiter: "Mozo",
  viewer: "Solo lectura",
};

export function EquipoTab({ restaurantId }: { restaurantId: string }) {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<RestaurantInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  async function reload() {
    const [m, i] = await Promise.all([
      listTeamMembers(supabase, restaurantId),
      listPendingInvitations(supabase, restaurantId),
    ]);
    setMembers(m.filter((x) => x.status === "active"));
    setInvitations(i);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function handleRoleChange(id: string, role: RestaurantRole) {
    await updateTeamMemberRole(supabase, id, role);
    reload();
  }

  async function handleRemove(id: string) {
    if (!confirm("¿Sacar a esta persona del equipo? Puede volver a invitarse después.")) return;
    await removeTeamMember(supabase, id);
    reload();
  }

  async function handleRevoke(id: string) {
    await revokeInvitation(supabase, id);
    reload();
  }

  if (loading) return <p className="text-sm text-ink-muted">Cargando…</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-muted max-w-md">
          Quién puede entrar al Centro de Control de este restaurante y qué puede hacer cada uno.
        </p>
        <button
          onClick={() => setShowInvite(true)}
          className="rounded-lg bg-accent text-accent-ink px-3 py-1.5 text-sm font-medium shrink-0"
        >
          + Invitar
        </button>
      </div>

      <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden mb-6">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{m.fullName || m.email}</p>
              {m.fullName && <p className="text-xs text-ink-faint truncate">{m.email}</p>}
            </div>
            {m.role === "owner" ? (
              <span className="text-xs text-ink-faint px-2.5 py-1.5">{ROLE_LABEL.owner}</span>
            ) : (
              <>
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value as RestaurantRole)}
                  className="rounded-lg bg-ground border border-line text-xs px-2 py-1.5 outline-none focus:border-accent"
                >
                  {INVITABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                {m.userId !== user?.id && (
                  <button onClick={() => handleRemove(m.id)} className="text-xs text-ink-faint hover:text-status-occupied">
                    Sacar
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {invitations.length > 0 && (
        <div>
          <p className="text-xs text-ink-faint uppercase tracking-wide mb-2">Invitaciones pendientes</p>
          <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{inv.email}</p>
                  <p className="text-xs text-ink-faint">
                    {ROLE_LABEL[inv.role]} · esperando a que se registre con este mail
                  </p>
                </div>
                <button onClick={() => handleRevoke(inv.id)} className="text-xs text-ink-faint hover:text-status-occupied">
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <InviteForm
          restaurantId={restaurantId}
          onCancel={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function InviteForm({
  restaurantId,
  onCancel,
  onInvited,
}: {
  restaurantId: string;
  onCancel: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("waiter");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"added" | "invited" | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await inviteStaffMember(supabase, restaurantId, email.trim(), role);
      setResult(outcome);
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : null;
      setError(message ?? "No pudimos invitar a esta persona.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 px-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-line bg-surface p-5">
        {result ? (
          <div>
            <h2 className="text-lg font-semibold mb-2">
              {result === "added" ? "Agregado ✓" : "Invitación creada"}
            </h2>
            <p className="text-sm text-ink-muted mb-4">
              {result === "added"
                ? `${email.trim()} ya tenía cuenta en Reservia — ya puede entrar a este restaurante.`
                : `${email.trim()} todavía no tiene cuenta. Pasale este link para que se registre con ese mismo mail — apenas lo haga, va a entrar directo al restaurante: ${window.location.origin}/signup`}
            </p>
            <button onClick={onInvited} className="w-full rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium">
              Listo
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-4">Invitar al equipo</h2>
            <label className="block text-sm text-ink-muted mb-1">Email</label>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@mail.com"
              className="w-full mb-3 rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <label className="block text-sm text-ink-muted mb-1">Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as InvitableRole)}
              className="w-full mb-4 rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>

            {error && <p className="text-sm text-status-occupied mb-3">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !email.trim()}
                className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {submitting ? "Invitando…" : "Invitar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
