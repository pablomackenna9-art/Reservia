export const LOCALES = ["es", "en", "pt"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
};

/** BCP-47 tag for Intl/toLocaleString calls (day names, month names, times). */
export const LOCALE_TAG: Record<Locale, string> = {
  es: "es-CL",
  en: "en-US",
  pt: "pt-BR",
};

interface Dictionary {
  openNow: (until: string) => string;
  closedNow: string;
  viewHours: string;
  morePeople: string;
  stepEmailTitle: string;
  stepEmailSubtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  consent: (restaurantName: string) => string;
  continueCta: string;
  back: string;
  stepWhenTitle: string;
  stepWhenSubtitle: string;
  people: string;
  legendAvailable: string;
  legendWaitlist: string;
  legendClosed: string;
  stepTimeTitle: string;
  loadingTimes: string;
  closedThatDay: string;
  noTimesThatDay: string;
  joinWaitlistCta: string;
  stepConfirmTitle: string;
  stepConfirmSubtitle: string;
  yourReservation: string;
  partySizeLabel: string;
  dateLabel: string;
  turnLabel: string;
  timeLabel: string;
  areYouX: (name: string) => string;
  emailShownLabel: string;
  fixMyData: string;
  firstNameLabel: string;
  lastNameLabel: string;
  phoneLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  availableMsg: string;
  confirmCta: string;
  sending: string;
  confirmedTitle: string;
  confirmedNote: string;
  waitlistTitle: string;
  waitlistSubtitle: (partySize: number, date: string) => string;
  waitlistDateNote: (date: string) => string;
  waitlistConfirmedTitle: string;
  waitlistConfirmedNote: string;
  requiredFields: string;
  notFound: (slug: string) => string;
  onlineBookingDisabled: string;
}

export const DICTIONARIES: Record<Locale, Dictionary> = {
  es: {
    openNow: (until) => `Abierto ahora · hasta las ${until}`,
    closedNow: "Cerrado ahora",
    viewHours: "Ver horarios",
    morePeople: "¿Más de 8? Llamá al restaurante directamente.",
    stepEmailTitle: "Reserva tu mesa",
    stepEmailSubtitle: "Empecemos por tu correo: ahí te confirmamos.",
    emailLabel: "TU CORREO",
    emailPlaceholder: "tucorreo@mail.com",
    consent: (name) => `Autorizo a ${name} a usar mis datos para gestionar esta reserva y contactarme por correo sobre ella.`,
    continueCta: "Continuar",
    back: "← Volver",
    stepWhenTitle: "¿Cuándo nos visitas?",
    stepWhenSubtitle: "Elegí el día, cuántos son y a qué hora.",
    people: "Personas",
    legendAvailable: "Disponible",
    legendWaitlist: "Lista de espera",
    legendClosed: "Cerrado",
    stepTimeTitle: "¿A qué hora?",
    loadingTimes: "Buscando horarios…",
    closedThatDay: "El restaurante está cerrado ese día — probá otra fecha.",
    noTimesThatDay: "No queda disponibilidad ese día para tu grupo.",
    joinWaitlistCta: "Anotarme en la lista de espera",
    stepConfirmTitle: "Confirma tu reserva",
    stepConfirmSubtitle: "Revisá y ajustá lo que necesites.",
    yourReservation: "TU RESERVA",
    partySizeLabel: "Personas",
    dateLabel: "Fecha",
    turnLabel: "Turno",
    timeLabel: "Hora",
    areYouX: (name) => `¿Eres ${name}?`,
    emailShownLabel: "Correo",
    fixMyData: "Corregir mis datos",
    firstNameLabel: "Nombre",
    lastNameLabel: "Apellido",
    phoneLabel: "Teléfono",
    notesLabel: "¿Algo que debamos saber? (opcional)",
    notesPlaceholder: "Cumpleaños, alergias, silla de bebé…",
    availableMsg: "Hay mesas disponibles: al confirmar te llega el correo con tu reserva.",
    confirmCta: "Sí, confirmar mi reserva",
    sending: "Enviando…",
    confirmedTitle: "Solicitud enviada",
    confirmedNote: "El restaurante todavía tiene que confirmarla — te avisamos por correo si hay algún cambio.",
    waitlistTitle: "Lista de espera",
    waitlistSubtitle: (n, date) => `${n} personas · ${date} — te avisamos por correo apenas se libere una mesa.`,
    waitlistDateNote: (date) => `Quiere venir el ${date}`,
    waitlistConfirmedTitle: "Anotado en la lista de espera",
    waitlistConfirmedNote: "Te avisamos por correo apenas se libere una mesa.",
    requiredFields: "Nombre y teléfono son obligatorios.",
    notFound: (slug) => `No encontramos "${slug}".`,
    onlineBookingDisabled: "Este restaurante no acepta reservas online por ahora — llamalo directamente.",
  },
  en: {
    openNow: (until) => `Open now · until ${until}`,
    closedNow: "Closed now",
    viewHours: "View hours",
    morePeople: "More than 8? Call the restaurant directly.",
    stepEmailTitle: "Book your table",
    stepEmailSubtitle: "Let's start with your email — we'll confirm there.",
    emailLabel: "YOUR EMAIL",
    emailPlaceholder: "you@email.com",
    consent: (name) => `I authorize ${name} to use my data to manage this reservation and contact me by email about it.`,
    continueCta: "Continue",
    back: "← Back",
    stepWhenTitle: "When are you coming?",
    stepWhenSubtitle: "Pick the day, party size, and time.",
    people: "People",
    legendAvailable: "Available",
    legendWaitlist: "Waitlist",
    legendClosed: "Closed",
    stepTimeTitle: "What time?",
    loadingTimes: "Looking for times…",
    closedThatDay: "The restaurant is closed that day — try another date.",
    noTimesThatDay: "No availability that day for your group.",
    joinWaitlistCta: "Join the waitlist",
    stepConfirmTitle: "Confirm your reservation",
    stepConfirmSubtitle: "Review and adjust anything you need.",
    yourReservation: "YOUR RESERVATION",
    partySizeLabel: "People",
    dateLabel: "Date",
    turnLabel: "Service",
    timeLabel: "Time",
    areYouX: (name) => `Are you ${name}?`,
    emailShownLabel: "Email",
    fixMyData: "Edit my details",
    firstNameLabel: "First name",
    lastNameLabel: "Last name",
    phoneLabel: "Phone",
    notesLabel: "Anything we should know? (optional)",
    notesPlaceholder: "Birthday, allergies, high chair…",
    availableMsg: "Tables are available: you'll get a confirmation email once you submit.",
    confirmCta: "Yes, confirm my reservation",
    sending: "Sending…",
    confirmedTitle: "Request sent",
    confirmedNote: "The restaurant still needs to confirm it — we'll email you if anything changes.",
    waitlistTitle: "Waitlist",
    waitlistSubtitle: (n, date) => `${n} people · ${date} — we'll email you as soon as a table opens up.`,
    waitlistDateNote: (date) => `Wants to come on ${date}`,
    waitlistConfirmedTitle: "Added to the waitlist",
    waitlistConfirmedNote: "We'll email you as soon as a table opens up.",
    requiredFields: "Name and phone are required.",
    notFound: (slug) => `We couldn't find "${slug}".`,
    onlineBookingDisabled: "This restaurant isn't taking online bookings right now — call them directly.",
  },
  pt: {
    openNow: (until) => `Aberto agora · até às ${until}`,
    closedNow: "Fechado agora",
    viewHours: "Ver horários",
    morePeople: "Mais de 8? Ligue diretamente para o restaurante.",
    stepEmailTitle: "Reserve sua mesa",
    stepEmailSubtitle: "Vamos começar pelo seu e-mail: é lá que confirmamos.",
    emailLabel: "SEU E-MAIL",
    emailPlaceholder: "seuemail@mail.com",
    consent: (name) => `Autorizo ${name} a usar meus dados para gerenciar esta reserva e me contatar por e-mail sobre ela.`,
    continueCta: "Continuar",
    back: "← Voltar",
    stepWhenTitle: "Quando você vem?",
    stepWhenSubtitle: "Escolha o dia, quantas pessoas e o horário.",
    people: "Pessoas",
    legendAvailable: "Disponível",
    legendWaitlist: "Lista de espera",
    legendClosed: "Fechado",
    stepTimeTitle: "A que horas?",
    loadingTimes: "Procurando horários…",
    closedThatDay: "O restaurante está fechado nesse dia — tente outra data.",
    noTimesThatDay: "Sem disponibilidade nesse dia para o seu grupo.",
    joinWaitlistCta: "Entrar na lista de espera",
    stepConfirmTitle: "Confirme sua reserva",
    stepConfirmSubtitle: "Revise e ajuste o que precisar.",
    yourReservation: "SUA RESERVA",
    partySizeLabel: "Pessoas",
    dateLabel: "Data",
    turnLabel: "Turno",
    timeLabel: "Horário",
    areYouX: (name) => `Você é ${name}?`,
    emailShownLabel: "E-mail",
    fixMyData: "Corrigir meus dados",
    firstNameLabel: "Nome",
    lastNameLabel: "Sobrenome",
    phoneLabel: "Telefone",
    notesLabel: "Algo que devemos saber? (opcional)",
    notesPlaceholder: "Aniversário, alergias, cadeirinha…",
    availableMsg: "Há mesas disponíveis: ao confirmar, você recebe o e-mail com sua reserva.",
    confirmCta: "Sim, confirmar minha reserva",
    sending: "Enviando…",
    confirmedTitle: "Solicitação enviada",
    confirmedNote: "O restaurante ainda precisa confirmá-la — avisamos por e-mail se algo mudar.",
    waitlistTitle: "Lista de espera",
    waitlistSubtitle: (n, date) => `${n} pessoas · ${date} — avisamos por e-mail assim que uma mesa vagar.`,
    waitlistDateNote: (date) => `Quer vir no dia ${date}`,
    waitlistConfirmedTitle: "Adicionado à lista de espera",
    waitlistConfirmedNote: "Avisamos por e-mail assim que uma mesa vagar.",
    requiredFields: "Nome e telefone são obrigatórios.",
    notFound: (slug) => `Não encontramos "${slug}".`,
    onlineBookingDisabled: "Este restaurante não está aceitando reservas online no momento — ligue diretamente.",
  },
};

const LOCALE_STORAGE_KEY = "reservia-booking-locale";

export function loadStoredLocale(): Locale {
  if (typeof window === "undefined") return "es";
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {
    // localStorage puede fallar en modo privado -- default silencioso a español.
  }
  return "es";
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // idem -- no es crítico si no persiste.
  }
}
