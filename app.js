const HOLIDAYS_API = 'https://api.argentinadatos.com/v1/feriados';
const STORAGE_KEY = 'ofi40-state-v1';
const HOLIDAY_CACHE_PREFIX = 'ofi40-holidays-';

const state = loadState();
let displayedDate = firstDayOfMonth(new Date());
let holidays = [];
let vacationMode = false;

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
};

document.querySelector('#previous-month').addEventListener('click', () => changeMonth(-1));
document.querySelector('#next-month').addEventListener('click', () => changeMonth(1));
els.markToday.addEventListener('click', markToday);
els.vacationMode.addEventListener('click', toggleVacationMode);

initialize();

async function initialize() {
  await loadHolidays(displayedDate.getFullYear());
  render();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      attendance: new Set(saved?.attendance || []),
      vacations: new Set(saved?.vacations || []),
    };
  } catch {
    return { attendance: new Set(), vacations: new Set() };
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    attendance: [...state.attendance],
    vacations: [...state.vacations],
  }));
}

async function loadHolidays(year) {
  const cacheKey = `${HOLIDAY_CACHE_PREFIX}${year}`;
  els.apiStatus.classList.remove('is-warning');
  els.apiStatus.textContent = 'Actualizando feriados…';

  try {
    const response = await fetch(`${HOLIDAYS_API}/${year}`);
    if (!response.ok) throw new Error(`API respondió ${response.status}`);
    holidays = await response.json();
    localStorage.setItem(cacheKey, JSON.stringify(holidays));
    els.apiStatus.textContent = 'Feriados nacionales actualizados desde ArgentinaDatos.';
  } catch {
    try {
      holidays = JSON.parse(localStorage.getItem(cacheKey)) || [];
    } catch { holidays = []; }
    els.apiStatus.classList.add('is-warning');
    els.apiStatus.textContent = holidays.length
      ? 'Sin conexión: se usan los feriados guardados en este dispositivo.'
      : 'No se pudieron cargar los feriados. Revisá tu conexión e intentá de nuevo.';
  }
}

async function changeMonth(offset) {
  displayedDate = new Date(displayedDate.getFullYear(), displayedDate.getMonth() + offset, 1);
  vacationMode = false;
  if (!holidays.length || !holidays.every((holiday) => holiday.fecha.startsWith(String(displayedDate.getFullYear())))) {
    await loadHolidays(displayedDate.getFullYear());
  }
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

function handleDayClick(key, info) {
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
  persistState();
  render();
}

function markToday() {
  const today = new Date();
  const key = localTodayKey();
  const info = getDayInfo(today.getFullYear(), today.getMonth(), today.getDate());
  if (!info.isWorkday || state.vacations.has(key)) return;
  if (state.attendance.has(key)) state.attendance.delete(key);
  else state.attendance.add(key);
  persistState();
  render();
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
