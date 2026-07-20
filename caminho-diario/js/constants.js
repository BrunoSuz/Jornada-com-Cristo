export const APP_KEY = 'caminhoDiarioDataV1';
export const MIGRATION_OWNER_KEY = 'caminhoDiarioMigrationOwnerV1';
export const DB_NAME = 'jornadaComCristo';
export const DB_VERSION = 1;
export const GUEST_SCOPE = 'guest';

export const RECORD_KINDS = Object.freeze({
  DAY: 'day',
  PRAYER: 'prayer',
  WEEK: 'week',
  SETTINGS: 'settings'
});

export const VALID_KINDS = Object.freeze(Object.values(RECORD_KINDS));
export const REVIEW_STATUSES = Object.freeze(['', 'sim', 'parcialmente', 'nao']);
export const PRAYER_CATEGORIES = Object.freeze([
  'Família', 'Igreja', 'Enfermos', 'Afastados', 'Trabalho',
  'Missões', 'Gratidão', 'Pessoal', 'Outro'
]);

export const DAY_TEXT_FIELDS = Object.freeze([
  'devotionalText', 'devotionalMessage', 'devotionalSurrender', 'devotionalPrayer',
  'ebdTitle', 'ebdMainText', 'ebdWeekTheme', 'ebdTopic', 'ebdTopics', 'ebdLearning',
  'ebdQuestions', 'ebdApplication', 'ebdDayPlan', 'ebdSaturdayReview', 'ebdSundaySummary',
  'bibleBook', 'bibleChapter', 'bibleVerses', 'bibleGod', 'bibleInsight',
  'bibleDirection', 'nextBibleReading', 'truthToday', 'actionToday',
  'personToday', 'reviewWhat', 'reviewChrist', 'reviewGrowth',
  'reviewTomorrow', 'reviewGratitude'
]);

export const DAY_CHECK_FIELDS = Object.freeze([
  'doneDevotional', 'doneEbd', 'bibleChapterCompleted', 'doneBible', 'donePractice', 'doneReview'
]);

export const WEEK_TEXT_FIELDS = Object.freeze([
  'weeklyLearning', 'weeklyPractice', 'weeklyDifficulty', 'weeklyPerson', 'weeklyFocus'
]);

export const MAX_TEXT_LENGTH = 10000;
export const MAX_NAME_LENGTH = 200;
export const MAX_RECORD_ID_LENGTH = 80;
export const MAX_PAYLOAD_BYTES = 100000;

export const defaultSettings = Object.freeze({
  name: '',
  morningTime: '06:00',
  practiceTime: '12:00',
  reviewTime: '21:30',
  theme: 'system'
});

export function createDefaultState() {
  return { settings: { ...defaultSettings }, days: {}, prayers: [], weeks: {} };
}
