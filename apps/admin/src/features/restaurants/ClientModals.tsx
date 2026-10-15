import { useState, type FormEvent } from "react";
import {
  adminAddOwner,
  adminApplyTemplate,
  adminCreateClient,
  adminSetUserPassword,
  updateRestaurant,
  type NewClientResult,
} from "@reservia/api-client";
import { slugify } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { bookingUrlFor } from "../../lib/config";
import { generatePassword } from "../../lib/password";
import { CopyButton, Field, Modal, inputClass } from "../../components/ui";

export interface TemplateOption {
  id: string;
  name: string;
  tableCount: number;
}

function errorText(err: unknown, fallback: string): string {
  const message = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  return message || fallback;
}

/** El mensaje listo para enviarle al cliente por WhatsApp o correo. */
function accessMessage(opts: { restaurantName: string; email: string; password: string | null; bookingUrl: string | null }): string {
  const lines = [
    `¡Hola! Tu restaurante ${opts.restaurantName} ya está listo en Reservia.`,
    "",
    `Panel de administración: ${window.location.origin}`,
    `Correo: ${opts.email}`,
    opts.password ? `Clave temporal: ${opts.password}` : "Entra con tu clave de siempre.",
    opts.password ? "(Al entrar, cámbiala en Más → Mi cuenta.)" : "",
  ];
  if (opts.bookingUrl) lines.push("", "Tu página de reservas, para compartir con tus clientes:", opts.bookingUrl);
  return lines.filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n");
}

function AccessResult({ message, note, onClose, extra }: { message: string; note?: string; onClose: () => void; extra?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {note && <p className="text-[15px] text-status-available font-semibold">{note}</p>}
      <div>
        <p className="text-[13px] text-ink-faint mb-1">Mensaje para enviarle al cliente (cópialo ahora: la clave no se vuelve a mostrar)</p>
        <pre className="rounded-xl bg-ground p-4 text-[14px] leading-relaxed whitespace-pre-wrap break-words font-mono">{message}</pre>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={message} label="Copiar mensaje" />
        {extra}
        <button onClick={onClose} className="h-11 px-4 rounded-[10px] text-[15px] font-semibold text-ink-muted">
          Listo
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------------------------

export function NewClientModal({
  templates,
  onClose,
  onCreated,
  onOpen,
}: {
  templates: TemplateOption[];
  onClose: () => void;
  onCreated: () => Promise<void>;
  onOpen: (restaurantId: string) => void;
}) {
  const defaultTemplate = [...templates].sort((a, b) => b.tableCount - a.tableCount)[0]?.id ?? "";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [template, setTemplate] = useState(defaultTemplate);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: NewClientResult; password: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await adminCreateClient(supabase, {
        name,
        slug,
        ownerEmail: ownerEmail || undefined,
        ownerPassword: ownerEmail ? password : undefined,
        ownerName: ownerName || undefined,
        templateRestaurantId: template || null,
        activate: publish,
      });
      await onCreated();
      setResult({ data, password });
    } catch (err) {
      setError(errorText(err, "No se pudo crear el cliente."));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const { data } = result;
    const tpl = data.template;
    return (
      <Modal title="Cliente creado ✓" onClose={onClose}>
        <p className="text-[15px] text-ink-muted mb-4">
          {tpl ? `${tpl.zones} zonas, ${tpl.tables} mesas en el plano y ${tpl.hours} franjas de horario ya configuradas. ` : "Restaurante vacío: falta armar su plano. "}
          {publish ? "Su página de reservas ya está publicada." : "Su página de reservas todavía no está publicada."}
        </p>
        {data.ownerEmail ? (
          <AccessResult
            message={accessMessage({
              restaurantName: name,
              email: data.ownerEmail,
              password: data.ownerCreated ? result.password : null,
              bookingUrl: publish ? bookingUrlFor(data.slug) : null,
            })}
            note={data.ownerCreated ? undefined : "Esa cuenta ya existía: no se le cambió la clave, entra con la suya."}
            onClose={onClose}
            extra={
              <button
                onClick={() => {
                  onOpen(data.restaurantId);
                  onClose();
                }}
                className="h-11 px-4 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold"
              >
                Abrir su panel
              </button>
            }
          />
        ) : (
          <button onClick={onClose} className="h-11 px-5 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold">
            Listo
          </button>
        )}
      </Modal>
    );
  }

  return (
    <Modal title="Nuevo cliente" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre del restaurante">
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            placeholder="Vinoteca Los Olivos"
            className={inputClass}
          />
        </Field>

        <Field label="Nombre corto del enlace" hint={slug ? bookingUrlFor(slug) : undefined}>
          <input
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field
          label="Empezar con el plano de"
          hint="Copia zonas, mesas en el mapa, horarios y reglas. Después lo ajustas con 'Editar plano'."
        >
          <select value={template} onChange={(e) => setTemplate(e.target.value)} className={inputClass}>
            <option value="">Vacío (lo armo desde cero)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.tableCount} mesas
              </option>
            ))}
          </select>
        </Field>

        <div className="rounded-xl bg-surface-2 p-4 space-y-3">
          <p className="text-[15px] font-semibold">Cuenta del dueño</p>
          <Field label="Correo">
            <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="dueno@restaurante.cl" className={inputClass} />
          </Field>
          {ownerEmail && (
            <>
              <Field label="Nombre (opcional)">
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Clave temporal" hint="Se la envías con el mensaje de acceso. Puede cambiarla al entrar.">
                <div className="flex gap-2">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} font-mono`} />
                  <button
                    type="button"
                    onClick={() => setPassword(generatePassword())}
                    className="h-11 px-3 rounded-[10px] bg-surface-3 text-[15px] font-semibold shrink-0"
                    title="Generar otra"
                  >
                    ↻
                  </button>
                </div>
              </Field>
            </>
          )}
          {!ownerEmail && <p className="text-[13px] text-ink-faint">Opcional: sin correo, el restaurante queda a tu nombre y le das acceso después.</p>}
        </div>

        <label className="flex items-center gap-3 text-[15px] min-h-11">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-5 w-5" />
          Publicar su página de reservas ahora
        </label>

        {error && <p className="text-[15px] text-status-occupied">{error}</p>}

        <button
          type="submit"
          disabled={busy || !name.trim() || !slug}
          className="w-full h-12 rounded-[10px] bg-accent text-accent-ink text-base font-semibold disabled:opacity-60"
        >
          {busy ? "Creando…" : "Crear cliente"}
        </button>
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------------------------------------------------------

export function AccessModal({
  restaurant,
  resetEmail,
  onClose,
  onDone,
}: {
  restaurant: { id: string; name: string; slug: string; status: string };
  /** Si viene, es "restablecer clave" de esa cuenta; si no, "dar acceso a un dueño". */
  resetEmail?: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const resetting = Boolean(resetEmail);
  const [email, setEmail] = useState(resetEmail ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; created: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (resetting) {
        await adminSetUserPassword(supabase, email, password);
        setDone({ email, created: true });
      } else {
        const result = await adminAddOwner(supabase, { restaurantId: restaurant.id, email, password, name });
        setDone(result);
      }
      await onDone();
    } catch (err) {
      setError(errorText(err, "No se pudo completar."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const showPassword = resetting || done.created;
    return (
      <Modal title={resetting ? "Clave restablecida ✓" : "Acceso creado ✓"} onClose={onClose}>
        <AccessResult
          message={accessMessage({
            restaurantName: restaurant.name,
            email: done.email,
            password: showPassword ? password : null,
            bookingUrl: restaurant.status === "active" ? bookingUrlFor(restaurant.slug) : null,
          })}
          note={!resetting && !done.created ? "Esa cuenta ya existía: ahora también es dueña de este restaurante y entra con su clave de siempre." : undefined}
          onClose={onClose}
        />
      </Modal>
    );
  }

  return (
    <Modal title={resetting ? "Restablecer clave" : "Dar acceso a un dueño"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[15px] text-ink-muted">
          {resetting
            ? "Se cambia la clave de esta cuenta y se cierran sus sesiones abiertas."
            : `Esta persona verá y administrará solo ${restaurant.name}.`}
        </p>
        <Field label="Correo">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={resetting}
            className={`${inputClass} ${resetting ? "opacity-70" : ""}`}
          />
        </Field>
        {!resetting && (
          <Field label="Nombre (opcional)">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
        )}
        <Field
          label={resetting ? "Clave nueva" : "Clave temporal"}
          hint={!resetting ? "Si el correo ya tiene cuenta, se conserva su clave." : undefined}
        >
          <div className="flex gap-2">
            <input required value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} font-mono`} />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="h-11 px-3 rounded-[10px] bg-surface-3 text-[15px] font-semibold shrink-0"
              title="Generar otra"
            >
              ↻
            </button>
          </div>
        </Field>
        {error && <p className="text-[15px] text-status-occupied">{error}</p>}
        <button
          type="submit"
          disabled={busy || !email}
          className="w-full h-12 rounded-[10px] bg-accent text-accent-ink text-base font-semibold disabled:opacity-60"
        >
          {busy ? "Guardando…" : resetting ? "Restablecer clave" : "Dar acceso"}
        </button>
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------------------------------------------------------

export function TemplateModal({
  restaurant,
  templates,
  onClose,
  onDone,
}: {
  restaurant: { id: string; name: string; status: string };
  templates: TemplateOption[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const options = templates.filter((t) => t.id !== restaurant.id);
  const [template, setTemplate] = useState([...options].sort((a, b) => b.tableCount - a.tableCount)[0]?.id ?? "");
  const [publish, setPublish] = useState(restaurant.status !== "active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApplyTemplate(supabase, restaurant.id, template);
      if (publish && restaurant.status !== "active") await updateRestaurant(supabase, restaurant.id, { status: "active" });
      await onDone();
      onClose();
    } catch (err) {
      setError(errorText(err, "No se pudo cargar la plantilla."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Cargar plantilla" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[15px] text-ink-muted">
          Copia a <span className="font-semibold text-ink">{restaurant.name}</span> las zonas, el plano de mesas, los horarios y las reglas de otro restaurante.
        </p>
        {options.length === 0 ? (
          <p className="text-[15px] text-ink-faint">Todavía no hay otro restaurante con mesas para usar de plantilla.</p>
        ) : (
          <Field label="Copiar desde">
            <select value={template} onChange={(e) => setTemplate(e.target.value)} className={inputClass}>
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.tableCount} mesas
                </option>
              ))}
            </select>
          </Field>
        )}
        {restaurant.status !== "active" && (
          <label className="flex items-center gap-3 text-[15px] min-h-11">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-5 w-5" />
            Publicar su página de reservas
          </label>
        )}
        {error && <p className="text-[15px] text-status-occupied">{error}</p>}
        <button
          type="submit"
          disabled={busy || !template}
          className="w-full h-12 rounded-[10px] bg-accent text-accent-ink text-base font-semibold disabled:opacity-60"
        >
          {busy ? "Copiando…" : "Cargar plantilla"}
        </button>
      </form>
    </Modal>
  );
}
