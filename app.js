const HOLIDAY_CACHE_PREFIX = 'ofi40-holidays-';
const HOLIDAY_CACHE_DURATION_MONTHS = 3;
const API_BASE_URL = window.OFI40_API_BASE_URL || '';

const state = { attendance: new Set(), vacations: new Set() };
let displayedDate = firstDayOfMonth(new Date());
let holidays = [];
let vacationMode = false;
let currentUser = null;

const els = {
  monthTitle: document.querySelector('#month-title'),
  monthSubtitle: document.querySelector('#month-subtitle'),
  attendanceCount: document.querySelector('#attendance-count'),
  requiredCount: document.querySelector('#required-count'),
  progressPercent: document.querySelector('#progress-percent'),
  progressFill: document.querySelector('#progress-fill'),
  progressTrack: document.querySelector('.progress-track'),
  progressLabel: document.querySelector('#progress-label'),
  calendarGrid: document.querySelector('#calendar-grid'),
  calculableDays: document.querySelector('#calculable-days'),
  markToday: document.querySelector('#mark-today'),
  vacationMode: document.querySelector('#vacation-mode'),
  interactionHelp: document.querySelector('#interaction-help'),
  todayLabel: document.querySelector('#today-label'),
  apiStatus: document.querySelector('#api-status'),
  accountButton: document.querySelector('#account-button'),
  authPanel: document.querySelector('#auth-panel'),
  authForm: document.querySelector('#auth-form'),
  authStatus: document.querySelector('#auth-status'),
  email: document.querySelector('#email'),
};

document.querySelector('#previous-month').addEventListener('click', () => changeMonth(-1));
document.querySelector('#next-month').addEventListener('click', () => changeMonth(1));
els.markToday.addEventListener('click', markToday);
els.vacationMode.addEventListener('click', toggleVacationMode);
els.accountButton.addEventListener('click', handleAccountButton);
els.authForm.addEventListener('submit', sendMagicLink);

initialize();

async function initialize() {
  await loadHolidays(displayedDate.getFullYear());
  await initializeSupabase();
  render();
}

async function initializeSupabase() {
  try {
    const data = await apiRequest('/v1/auth/session');
    currentUser = data.user;
  } catch (error) {
    if (error.status !== 401) setAuthStatus('No se pudo recuperar tu sesión.', true);
  }
  updateAccountControls();
  if (currentUser) {
    await loadAttendanceForDisplayedMonth();
  }
}

async function handleAccountButton() {
  if (currentUser) {
    try {
      await apiRequest('/v1/auth/logout', { method: 'POST' });
      currentUser = null;
      state.attendance.clear();
      state.vacations.clear();
      updateAccountControls();
      render();
    } catch {
      setAuthStatus('No se pudo cerrar la sesión.', true);
    }
    return;
  }
  els.authPanel.hidden = !els.authPanel.hidden;
  if (!els.authPanel.hidden) els.email.focus();
}

async function sendMagicLink(event) {
  event.preventDefault();
  setAuthStatus('Enviando link de acceso…');
  try {
    await apiRequest('/v1/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email: els.email.value }),
    });
  } catch (error) {
    setAuthStatus(error.message || 'No se pudo enviar el link de acceso.', true);
    return;
  }
  setAuthStatus('Revisá tu email y abrí el link para sincronizar tu historial.');
  els.authForm.reset();
}

function updateAccountControls() {
  const email = currentUser?.email;
  els.accountButton.textContent = email ? `Conectado: ${email}` : 'Iniciar sesión';
  els.accountButton.classList.toggle('is-signed-in', Boolean(email));
  if (email) {
    els.authPanel.hidden = true;
    setAuthStatus('Historial sincronizado con tu cuenta.');
  }
}

function setAuthStatus(message, isError = false) {
  els.authStatus.textContent = message;
  els.authStatus.style.color = isError ? '#a14c2f' : '';
}

async function syncChangedEntry(key) {
  if (!currentUser) return;
  const status = state.attendance.has(key) ? 'office' : state.vacations.has(key) ? 'vacation' : null;
  try {
    await apiRequest(`/v1/attendance/${key}`, status
      ? { method: 'PUT', body: JSON.stringify({ status }) }
      : { method: 'DELETE' });
  } catch (error) {
    setAuthStatus(`No se pudo guardar el cambio: ${error.message}`, true);
  }
}

async function loadAttendanceForDisplayedMonth() {
  if (!currentUser) return;
  const year = displayedDate.getFullYear();
  const month = displayedDate.getMonth();
  const first = dateKey(year, month, 1);
  const last = dateKey(year, month, new Date(year, month + 1, 0).getDate());
  try {
    const entries = await apiRequest(`/v1/attendance?from=${first}&to=${last}`);
    for (const key of [...state.attendance, ...state.vacations]) {
      if (key >= first && key <= last) {
        state.attendance.delete(key);
        state.vacations.delete(key);
      }
    }
    entries.forEach((entry) => {
      if (entry.status === 'office') state.attendance.add(entry.work_date);
      if (entry.status === 'vacation') state.vacations.add(entry.work_date);
    });
    setAuthStatus('Historial sincronizado con tu cuenta.');
  } catch (error) {
    setAuthStatus(`No se pudo descargar el historial: ${error.message}`, true);
  }
}

async function apiRequest(path, options = {}, retried = false) {
  if (!API_BASE_URL) {
    const error = new Error('Falta configurar la URL de la API.');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (response.status === 401 && !retried && path !== '/v1/auth/refresh') {
    const refresh = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    });
    if (refresh.ok) return apiRequest(path, options, true);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.detail || 'Error de conexión con la API.');
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadHolidays(year) {
  const cacheKey = `${HOLIDAY_CACHE_PREFIX}${year}`;
  els.apiStatus.classList.remove('is-warning');
  const cachedHolidays = getHolidayCache(cacheKey);

  if (cachedHolidays?.isFresh) {
    holidays = cachedHolidays.holidays;
    els.apiStatus.textContent = 'Feriados cargados desde el caché local.';
    return;
  }

  els.apiStatus.textContent = 'Actualizando feriados…';

  try {
    holidays = await apiRequest(`/v1/holidays?year=${year}`);
    localStorage.setItem(cacheKey, JSON.stringify(createHolidayCache(holidays)));
    els.apiStatus.textContent = 'Feriados nacionales actualizados desde ArgentinaDatos.';
  } catch {
    holidays = cachedHolidays?.holidays || [];
    els.apiStatus.classList.add('is-warning');
    els.apiStatus.textContent = holidays.length
      ? 'Sin conexión: se usan los feriados guardados, aunque su caché haya vencido.'
      : 'No se pudieron cargar los feriados. Revisá tu conexión e intentá de nuevo.';
  }
}

function getHolidayCache(cacheKey) {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (Array.isArray(cached)) return { holidays: cached, isFresh: false };
    if (!Array.isArray(cached?.holidays)) return null;
    return {
      holidays: cached.holidays,
      isFresh: Number.isFinite(cached.expiresAt) && cached.expiresAt > Date.now(),
    };
  } catch {
    return null;
  }
}

function createHolidayCache(holidayList) {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + HOLIDAY_CACHE_DURATION_MONTHS);
  return { holidays: holidayList, cachedAt: Date.now(), expiresAt: expiresAt.getTime() };
}

async function changeMonth(offset) {
  displayedDate = new Date(displayedDate.getFullYear(), displayedDate.getMonth() + offset, 1);
  vacationMode = false;
  if (!holidays.length || !holidays.every((holiday) => holiday.fecha.startsWith(String(displayedDate.getFullYear())))) {
    await loadHolidays(displayedDate.getFullYear());
  }
  if (currentUser) await loadAttendanceForDisplayedMonth();
  render();
}

function render() {
  const year = displayedDate.getFullYear();
  const month = displayedDate.getMonth();
  const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
  els.monthTitle.textContent = monthFormatter.format(displayedDate);
  els.monthSubtitle.textContent = '40% de los días laborales del mes';

  const summary = getMonthSummary(year, month);
  const percent = summary.required === 0 ? 100 : Math.min(100, Math.round((summary.attended / summary.required) * 100));
  const pending = Math.max(0, summary.required - summary.attended);
  els.attendanceCount.textContent = summary.attended;
  els.requiredCount.textContent = summary.required;
  els.progressPercent.textContent = percent;
  els.progressFill.style.width = `${percent}%`;
  els.progressTrack.setAttribute('aria-valuenow', String(percent));
  els.calculableDays.textContent = `${summary.workdays} ${summary.workdays === 1 ? 'día calculable' : 'días calculables'}`;
  els.progressLabel.textContent = pending === 0
    ? '¡Objetivo del mes cumplido!'
    : `Te ${pending === 1 ? 'falta' : 'faltan'} ${pending} ${pending === 1 ? 'día' : 'días'} para completar el 40%.`;

  updateActions();
  renderCalendar(year, month);
}

function updateActions() {
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const todayInfo = getDayInfo(today.getFullYear(), today.getMonth(), today.getDate());
  const todayWasMarked = state.attendance.has(todayKey);
  const canMarkToday = todayInfo.isWorkday && !state.vacations.has(todayKey);
  els.markToday.disabled = !canMarkToday;
  els.markToday.style.opacity = canMarkToday ? '1' : '.55';
  els.markToday.style.cursor = canMarkToday ? 'pointer' : 'not-allowed';
  els.markToday.querySelector('strong').textContent = todayWasMarked ? 'Ya marqué hoy' : 'Hoy voy a la ofi';
  els.todayLabel.textContent = canMarkToday
    ? (todayWasMarked ? 'Tocá para deshacer' : 'Registrá tu asistencia de hoy')
    : 'Hoy no es un día laborable';
  els.vacationMode.classList.toggle('is-active', vacationMode);
  els.vacationMode.setAttribute('aria-pressed', String(vacationMode));
  els.vacationMode.querySelector('strong').textContent = vacationMode ? 'Listo, volver a asistencias' : 'Marcar vacaciones';
  els.interactionHelp.textContent = vacationMode
    ? 'Modo vacaciones activo: tocá días laborales para sumarlos o quitarlos de tus vacaciones.'
    : 'Tocá un día laboral pasado para registrar que fuiste a la oficina.';
}

function renderCalendar(year, month) {
  els.calendarGrid.replaceChildren();
  const firstWeekday = mondayFirstIndex(new Date(year, month, 1).getDay());
  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let index = 0; index < firstWeekday; index += 1) {
    const blank = document.createElement('div');
    blank.className = 'day day--empty';
    els.calendarGrid.append(blank);
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const key = dateKey(year, month, day);
    const info = getDayInfo(year, month, day);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day';
    button.dataset.date = key;
    button.textContent = day;
    const isToday = key === localTodayKey();
    if (info.isWeekend) button.classList.add('day--weekend');
    if (info.holiday) button.classList.add('day--holiday');
    if (state.attendance.has(key)) button.classList.add('day--attended');
    if (state.vacations.has(key)) button.classList.add('day--vacation');
    if (isToday) button.classList.add('day--today');
    if (!info.isWorkday) button.disabled = true;
    button.setAttribute('aria-label', accessibleDayLabel(day, month, year, info, key));
    if (info.holiday) {
      const label = document.createElement('span');
      label.className = 'holiday-label';
      label.textContent = info.holiday.nombre;
      button.append(label);
    } else if (state.attendance.has(key) || state.vacations.has(key)) {
      const marker = document.createElement('span');
      marker.className = 'marker';
      marker.textContent = state.attendance.has(key) ? '✓' : '☼';
      marker.setAttribute('aria-hidden', 'true');
      button.append(marker);
    }
    button.addEventListener('click', () => handleDayClick(key, info));
    els.calendarGrid.append(button);
  }
}

async function handleDayClick(key, info) {
  if (!info.isWorkday) return;
  if (vacationMode) {
    if (state.vacations.has(key)) state.vacations.delete(key);
    else {
      state.vacations.add(key);
      state.attendance.delete(key);
    }
  } else if (state.vacations.has(key)) {
    state.vacations.delete(key);
  } else if (key <= localTodayKey()) {
    if (state.attendance.has(key)) state.attendance.delete(key);
    else state.attendance.add(key);
  }
  render();
  await syncChangedEntry(key);
}

async function markToday() {
  const today = new Date();
  const key = localTodayKey();
  const info = getDayInfo(today.getFullYear(), today.getMonth(), today.getDate());
  if (!info.isWorkday || state.vacations.has(key)) return;
  if (state.attendance.has(key)) state.attendance.delete(key);
  else state.attendance.add(key);
  render();
  await syncChangedEntry(key);
}

function toggleVacationMode() {
  vacationMode = !vacationMode;
  updateActions();
}

function getMonthSummary(year, month) {
  const totalDays = new Date(year, month + 1, 0).getDate();
  let workdays = 0;
  let attended = 0;
  for (let day = 1; day <= totalDays; day += 1) {
    const key = dateKey(year, month, day);
    const info = getDayInfo(year, month, day);
    if (info.isWorkday && !state.vacations.has(key)) {
      workdays += 1;
      if (state.attendance.has(key)) attended += 1;
    }
  }
  return { workdays, attended, required: Math.ceil(workdays * 0.4) };
}

function getDayInfo(year, month, day) {
  const date = new Date(year, month, day);
  const key = dateKey(year, month, day);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const holiday = holidays.find((item) => item.fecha === key);
  return { isWeekend, holiday, isWorkday: !isWeekend && !holiday };
}

function accessibleDayLabel(day, month, year, info, key) {
  const label = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date(year, month, day));
  if (info.holiday) return `${label}, feriado: ${info.holiday.nombre}`;
  if (info.isWeekend) return `${label}, fin de semana`;
  if (state.attendance.has(key)) return `${label}, asistencia registrada`;
  if (state.vacations.has(key)) return `${label}, vacaciones`;
  return `${label}, día laborable`;
}

function firstDayOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function dateKey(year, month, day) { return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function localTodayKey() { const today = new Date(); return dateKey(today.getFullYear(), today.getMonth(), today.getDate()); }
function mondayFirstIndex(day) { return day === 0 ? 6 : day - 1; }
