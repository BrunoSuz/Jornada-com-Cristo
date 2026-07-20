import {
  DAY_CHECK_FIELDS, DAY_TEXT_FIELDS, MAX_NAME_LENGTH, MAX_PAYLOAD_BYTES,
  MAX_RECORD_ID_LENGTH, MAX_TEXT_LENGTH, PRAYER_CATEGORIES, RECORD_KINDS,
  REVIEW_STATUSES, VALID_KINDS, WEEK_TEXT_FIELDS, defaultSettings
} from './constants.js';
import { byteLength, isValidIsoDate, nowIso } from './utils.js';

function text(value, max = MAX_TEXT_LENGTH) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function date(value, fallback = null) {
  return isValidIsoDate(value) ? new Date(value).toISOString() : fallback;
}

function assertRecord(kind, id, payload) {
  if (!VALID_KINDS.includes(kind)) throw new TypeError(`Tipo de registro inválido: ${kind}`);
  if (typeof id !== 'string' || !id.length || id.length > MAX_RECORD_ID_LENGTH) throw new TypeError('Identificador de registro inválido.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('Payload precisa ser um objeto.');
  if (byteLength(payload) > MAX_PAYLOAD_BYTES) throw new RangeError('Registro excede o tamanho máximo permitido.');
  return payload;
}

export function normalizeDay(id, data = {}) {
  const normalized = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : id,
    updatedAt: date(data.updatedAt, nowIso()),
    reviewStatus: REVIEW_STATUSES.includes(data.reviewStatus) ? data.reviewStatus : ''
  };
  DAY_TEXT_FIELDS.forEach(key => { normalized[key] = text(data[key]); });
  DAY_CHECK_FIELDS.forEach(key => { normalized[key] = Boolean(data[key]); });
  return assertRecord(RECORD_KINDS.DAY, id, normalized);
}

export function normalizePrayer(id, data = {}) {
  const category = PRAYER_CATEGORIES.includes(data.category) ? data.category : 'Outro';
  const legacyDone = Boolean(data.done);
  const status = ['active', 'answered', 'archived'].includes(data.status)
    ? data.status
    : legacyDone ? 'answered' : 'active';
  const normalized = {
    id,
    name: text(data.name, MAX_NAME_LENGTH),
    reason: text(data.reason),
    category,
    status,
    createdAt: date(data.createdAt, nowIso()),
    updatedAt: date(data.updatedAt, date(data.createdAt, nowIso())),
    lastPrayed: date(data.lastPrayed),
    answeredAt: date(data.answeredAt),
    answer: text(data.answer),
    archivedAt: date(data.archivedAt),
    done: status !== 'active'
  };
  return assertRecord(RECORD_KINDS.PRAYER, id, normalized);
}

export function normalizeWeek(id, data = {}) {
  const normalized = {
    week: /^\d{4}-W\d{2}$/.test(data.week) ? data.week : id,
    savedAt: date(data.savedAt, nowIso()),
    updatedAt: date(data.updatedAt, date(data.savedAt, nowIso()))
  };
  WEEK_TEXT_FIELDS.forEach(key => { normalized[key] = text(data[key]); });
  return assertRecord(RECORD_KINDS.WEEK, id, normalized);
}

export function normalizeSettings(data = {}) {
  const legacyTheme = data.darkMode === true ? 'dark' : data.darkMode === false ? 'light' : null;
  const theme = ['system', 'light', 'dark'].includes(data.theme) ? data.theme : legacyTheme || defaultSettings.theme;
  return assertRecord(RECORD_KINDS.SETTINGS, 'profile', {
    ...defaultSettings,
    name: text(data.name, MAX_NAME_LENGTH),
    morningTime: /^\d{2}:\d{2}$/.test(data.morningTime) ? data.morningTime : defaultSettings.morningTime,
    practiceTime: /^\d{2}:\d{2}$/.test(data.practiceTime) ? data.practiceTime : defaultSettings.practiceTime,
    reviewTime: /^\d{2}:\d{2}$/.test(data.reviewTime) ? data.reviewTime : defaultSettings.reviewTime,
    theme,
    updatedAt: date(data.updatedAt, nowIso())
  });
}

export function normalizeRecord(kind, id, payload) {
  if (kind === RECORD_KINDS.DAY) return normalizeDay(id, payload);
  if (kind === RECORD_KINDS.PRAYER) return normalizePrayer(id, payload);
  if (kind === RECORD_KINDS.WEEK) return normalizeWeek(id, payload);
  if (kind === RECORD_KINDS.SETTINGS) return normalizeSettings(payload);
  throw new TypeError(`Tipo de registro inválido: ${kind}`);
}

export function validateBackup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('O backup precisa conter um objeto JSON.');
  const normalized = { settings: normalizeSettings(value.settings || {}), days: {}, prayers: [], weeks: {} };
  Object.entries(value.days || {}).forEach(([id, payload]) => { normalized.days[id] = normalizeDay(id, payload); });
  const prayerIds = new Set();
  (Array.isArray(value.prayers) ? value.prayers : []).forEach(payload => {
    const id = typeof payload?.id === 'string' ? payload.id : '';
    if (!id || prayerIds.has(id)) return;
    prayerIds.add(id);
    normalized.prayers.push(normalizePrayer(id, payload));
  });
  Object.entries(value.weeks || {}).forEach(([id, payload]) => { normalized.weeks[id] = normalizeWeek(id, payload); });
  return normalized;
}
