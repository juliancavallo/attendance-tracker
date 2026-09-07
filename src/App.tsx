import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient, Session } from "@supabase/supabase-js";

type Entry = { work_date: string; status: "office" | "vacation" };
type Holiday = { fecha: string; nombre: string };
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const apiBase = import.meta.env.VITE_API_BASE_URL;
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftMonth = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);

function Login({ onSession }: { onSession: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (!supabase) {
      setError("Faltan variables de configuración de Supabase.");
      setBusy(false);
      return;
    }
    const { data, error: signInError } = await supabase.auth.signInWithPassword(
      { email, password },
    );
    setBusy(false);
    if (signInError || !data.session) setError("Email o contraseña inválidos.");
    else onSession(data.session);
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand">
          <span className="brand-mark">40</span>
          <span>
            Ofi<span>40%</span>
          </span>
        </div>
        <p className="eyebrow">ASISTENCIA HÍBRIDA</p>
        <h1>
          Tu mes en la oficina,
          <br />
          <em>sin hacer cuentas.</em>
        </h1>
        <p>Ingresá para consultar y registrar tu asistencia.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button disabled={busy}>
            {busy ? "Ingresando…" : "Iniciar sesión"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  if (!ready) return <div className="loading">Cargando Ofi 40%…</div>;
  return session ? (
    <Tracker
      session={session}
      onLogout={() => {
        void supabase?.auth.signOut();
      }}
    />
  ) : (
    <Login onSession={setSession} />
  );
}

function Tracker({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [vacationMode, setVacationMode] = useState(false);
  const [status, setStatus] = useState("");
  const first = key(month);
  const last = key(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  async function api(path: string, options: RequestInit = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!response.ok)
      throw new Error(
        (await response.json().catch(() => ({}))).detail ||
          "No se pudo conectar con la API.",
      );
    return response.status === 204 ? null : response.json();
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api(`/v1/attendance?from=${first}&to=${last}`),
      fetch(`${apiBase}/v1/holidays?year=${month.getFullYear()}`).then((r) =>
        r.ok ? r.json() : Promise.reject(),
      ),
    ])
      .then(([newEntries, newHolidays]) => {
        if (active) {
          setEntries(newEntries);
          setHolidays(newHolidays);
          setStatus("Historial sincronizado.");
        }
      })
      .catch(
        () =>
          active &&
          setStatus("La API está iniciando o no se pudo cargar el historial."),
      );
    return () => {
      active = false;
    };
  }, [first, last, session.access_token]);
  const entryMap = useMemo(
    () => new Map(entries.map((entry) => [entry.work_date, entry.status])),
    [entries],
  );
  const holidayMap = useMemo(
    () => new Map(holidays.map((holiday) => [holiday.fecha, holiday])),
    [holidays],
  );
  const days = Array.from(
    {
      length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
  );
  const workdays = days.filter(
    (d) =>
      d.getDay() !== 0 &&
      d.getDay() !== 6 &&
      !holidayMap.has(key(d)) &&
      entryMap.get(key(d)) !== "vacation",
  );
  const attended = workdays.filter(
    (d) => entryMap.get(key(d)) === "office",
  ).length;
  const required = Math.ceil(workdays.length * 0.4);
  const percent = required
    ? Math.min(100, Math.round((attended / required) * 100))
    : 100;
  async function toggle(date: Date) {
    const workDate = key(date);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    if (
      weekend ||
      holidayMap.has(workDate) ||
      (!vacationMode && workDate > key(new Date()))
    )
      return;
    const old = entryMap.get(workDate);
    const next: Entry["status"] | undefined = vacationMode
      ? old === "vacation"
        ? undefined
        : "vacation"
      : old === "office"
        ? undefined
        : "office";
    setEntries((current) => [
      ...current.filter((entry) => entry.work_date !== workDate),
      ...(next ? [{ work_date: workDate, status: next }] : []),
    ]);
    try {
      await api(
        `/v1/attendance/${workDate}`,
        next
          ? { method: "PUT", body: JSON.stringify({ status: next }) }
          : { method: "DELETE" },
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }
  const blank = (month.getDay() + 6) % 7;
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">40</span>
          <span>
            Ofi<span>40%</span>
          </span>
        </a>
        <button
          className="account-button is-signed-in"
          onClick={() => onLogout()}
        >
          Cerrar sesión
        </button>
      </header>
      <section className="intro">
        <p className="eyebrow">ASISTENCIA HÍBRIDA</p>
        <h1>
          Tu mes en la oficina,
          <br />
          <em>sin hacer cuentas.</em>
        </h1>
      </section>
      <section className="month-navigation">
        <button
          className="icon-button"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ←
        </button>
        <div>
          <h2>
            {new Intl.DateTimeFormat("es-AR", {
              month: "long",
              year: "numeric",
            }).format(month)}
          </h2>
          <p>40% de los días laborales del mes</p>
        </div>
        <button
          className="icon-button"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          →
        </button>
      </section>
      <section className="progress-card">
        <div className="progress-card__header">
          <div>
            <p className="eyebrow">OBJETIVO DEL MES</p>
            <p className="progress-copy">
              <strong>{attended}</strong> de <strong>{required}</strong> días
            </p>
          </div>
          <div className="percentage">
            <span>{percent}</span>
            <small>%</small>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="progress-message">
          {Math.max(0, required - attended)
            ? `Te faltan ${required - attended} días para completar el 40%.`
            : "¡Objetivo del mes cumplido!"}
        </p>
      </section>
      <section className="quick-actions">
        <button className="primary-action" onClick={() => toggle(new Date())}>
          <span className="action-icon">✓</span>
          <span>
            <strong>Hoy voy a la ofi</strong>
            <small>Registrá tu asistencia de hoy</small>
          </span>
        </button>
        <button
          className={`mode-action ${vacationMode ? "is-active" : ""}`}
          onClick={() => setVacationMode(!vacationMode)}
        >
          <span className="action-icon">☼</span>
          <span>
            <strong>
              {vacationMode
                ? "Listo, volver a asistencias"
                : "Marcar vacaciones"}
            </strong>
            <small>Elegí días en el calendario</small>
          </span>
        </button>
      </section>
      <p className="interaction-help">
        {vacationMode
          ? "Modo vacaciones activo."
          : "Tocá un día laboral pasado para registrar asistencia."}
      </p>
      <section className="calendar-section">
        <div className="calendar-heading">
          <h2>Calendario</h2>
          <span>{workdays.length} días calculables</span>
        </div>
        <div className="weekdays">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {Array.from({ length: blank }, (_, i) => (
            <div className="day day--empty" key={`blank-${i}`} />
          ))}
          {days.map((day) => {
            const dayKey = key(day);
            const holiday = holidayMap.get(dayKey);
            const weekend = day.getDay() === 0 || day.getDay() === 6;
            const entry = entryMap.get(dayKey);
            return (
              <button
                key={dayKey}
                className={`day ${weekend ? "day--weekend" : ""} ${holiday ? "day--holiday" : ""} ${entry === "office" ? "day--attended" : ""} ${entry === "vacation" ? "day--vacation" : ""} ${dayKey === key(new Date()) ? "day--today" : ""}`}
                disabled={weekend || Boolean(holiday)}
                onClick={() => toggle(day)}
              >
                {day.getDate()}
                {holiday && (
                  <span className="holiday-label">{holiday.nombre}</span>
                )}
                {entry && (
                  <span className="marker">
                    {entry === "office" ? "✓" : "☼"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
      <section className="legend">
        <span>
          <i className="legend-dot attended" />
          Fui a la ofi
        </span>
        <span>
          <i className="legend-dot vacation" />
          Vacaciones
        </span>
        <span>
          <i className="legend-dot holiday" />
          Feriado
        </span>
        <span>
          <i className="legend-dot weekend" />
          Fin de semana
        </span>
      </section>
      <p className="api-status">{status}</p>
    </main>
  );
}
