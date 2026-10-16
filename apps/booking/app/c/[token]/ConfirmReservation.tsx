"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getReservationByToken, respondToReservation, type PublicReservationView } from "@reservia/api-client";
import { supabase } from "../../../lib/supabase";

type Outcome = "confirmed" | "declined" | null;

function whenParts(view: PublicReservationView) {
  const d = new Date(view.startsAt);
  const date = d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: view.timezone });
  const time = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: view.timezone });
  return { date, time };
}

/** Página a la que llega el cliente desde el WhatsApp o el correo: re-confirma su asistencia o avisa que no puede ir. */
export function ConfirmReservation({ token }: { token: string }) {
  const [view, setView] = useState<PublicReservationView | null | undefined>(undefined);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReservationByToken(supabase, token)
      .then((v) => {
        setView(v);
        if (v?.customerResponse) setOutcome(v.customerResponse);
      })
      .catch(() => setView(null));
  }, [token]);

  async function respond(action: "confirm" | "decline") {
    setBusy(true);
    setError(null);
    try {
      setOutcome(await respondToReservation(supabase, token, action));
      setAsking(false);
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String(err.message) : "No pudimos registrar tu respuesta. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (view === undefined) return <p className="text-sm text-ink-muted">Cargando tu reserva…</p>;

  if (view === null) {
    return (
      <Shell>
        <h1 className="font-serif text-[40px] leading-none mb-3">No encontramos tu reserva</h1>
        <p className="text-[15px] text-ink-muted">El enlace no es válido o ya expiró. Si necesitas ayuda, contacta directamente al restaurante.</p>
      </Shell>
    );
  }

  const { date, time } = whenParts(view);
  const cancelledByRestaurant = view.status === "cancelled" && outcome !== "declined";
  const finished = ["completed", "no_show", "seated"].includes(view.status);

  return (
    <Shell>
      <div className="text-center mb-6">
        {view.restaurantLogo ? (
          <img src={view.restaurantLogo} alt={view.restaurantName} className="mx-auto h-24 w-auto max-w-full object-contain" />
        ) : (
          <p className="font-serif text-[40px] leading-none">{view.restaurantName}</p>
        )}
      </div>

      {outcome === "confirmed" ? (
        <Message tone="ok" title={`¡Gracias, ${view.firstName}!`} text="Quedaste confirmado. Te esperamos." />
      ) : outcome === "declined" ? (
        <Message
          tone="info"
          title="Reserva cancelada"
          text={`Gracias por avisarnos, ${view.firstName}. Liberamos tu mesa. Cuando quieras volver, puedes reservar de nuevo.`}
        />
      ) : cancelledByRestaurant ? (
        <Message tone="info" title="Esta reserva fue cancelada" text="Si fue un error, contacta directamente al restaurante." />
      ) : finished ? (
        <Message tone="info" title="Esta reserva ya no se puede modificar" text="" />
      ) : (
        <>
          <h1 className="font-serif text-[40px] leading-none text-center mb-2">Hola, {view.firstName}</h1>
          <p className="text-[15px] text-ink-muted text-center mb-6">¿Confirmas que vienes?</p>
        </>
      )}

      <div className="rounded-2xl border-2 border-dashed border-line-strong p-5 mt-6">
        <p className="font-serif text-[56px] leading-none tabular-nums">{time}</p>
        <p className="text-[15px] text-ink-muted mt-2 first-letter:uppercase">{date}</p>
        <p className="text-[15px] text-ink mt-3">
          {view.partySize} {view.partySize === 1 ? "persona" : "personas"}
          {view.zoneName ? ` · ${view.zoneName}` : ""}
        </p>
      </div>

      {!outcome && !cancelledByRestaurant && !finished && (
        <div className="mt-6 space-y-3">
          {error && <p className="text-sm text-status-occupied">{error}</p>}
          {!asking ? (
            <>
              <button
                onClick={() => respond("confirm")}
                disabled={busy}
                className="w-full h-[54px] rounded-[14px] bg-ink-dark text-white text-base font-semibold disabled:opacity-50"
              >
                {busy ? "Enviando…" : "Sí, voy"}
              </button>
              <button
                onClick={() => setAsking(true)}
                disabled={busy}
                className="w-full h-[54px] rounded-[14px] bg-surface text-ink text-base font-semibold hover:bg-line disabled:opacity-50"
              >
                No podré ir
              </button>
            </>
          ) : (
            <div className="rounded-xl bg-surface p-4">
              <p className="text-[15px] mb-3">¿Seguro? Cancelaremos tu reserva y liberaremos la mesa para otra persona.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => respond("decline")}
                  disabled={busy}
                  className="flex-1 h-12 rounded-[12px] bg-status-occupied text-white text-[15px] font-semibold disabled:opacity-50"
                >
                  {busy ? "Enviando…" : "Sí, cancelar"}
                </button>
                <button onClick={() => setAsking(false)} disabled={busy} className="flex-1 h-12 rounded-[12px] bg-ground text-[15px] font-semibold">
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-sm">{children}</div>;
}

function Message({ tone, title, text }: { tone: "ok" | "info"; title: string; text: string }) {
  return (
    <div className={`rounded-xl px-4 py-4 text-center ${tone === "ok" ? "bg-status-available/10 border border-status-available/40" : "bg-surface"}`}>
      <p className={`font-serif text-[32px] leading-tight ${tone === "ok" ? "text-status-available" : ""}`}>{title}</p>
      {text && <p className="text-[15px] text-ink-muted mt-1">{text}</p>}
    </div>
  );
}
