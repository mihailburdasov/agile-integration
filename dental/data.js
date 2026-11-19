// Вымышленные пациенты для прототипа. Совпадения случайны.
export const CLIENTS = [
  {
    id: 'c-1042',
    name: 'Анна Тестова',
    birthYear: 1988,
    doctor: 'Д-р И. Примеров',
    scanDate: '2026-10-28',
    plan: {
      current: { tooth: 36, procedure: 'Эндодонтическое лечение каналов', date: '2026-11-20' },
      next: [
        { tooth: 37, procedure: 'Лечение кариеса, пломба', eta: '2026-12-04' },
        { tooth: 26, procedure: 'Коронка из диоксида циркония', eta: '2027-01-15' },
      ],
    },
    treated: [11, 46],
    mailing: { subject: 'Анна, ваш план лечения: зуб 36 и следующие шаги', sentAt: '2026-11-12' },
  },
  {
    id: 'c-1057',
    name: 'Борис Образцов',
    birthYear: 1975,
    doctor: 'Д-р М. Условная',
    scanDate: '2026-10-30',
    plan: {
      current: { tooth: 48, procedure: 'Удаление зуба мудрости', date: '2026-11-22' },
      next: [
        { tooth: 47, procedure: 'Лечение кариеса, пломба', eta: '2026-12-10' },
        { tooth: 17, procedure: 'Лечение кариеса, пломба', eta: '2026-12-24' },
      ],
    },
    treated: [16, 36, 25],
    mailing: { subject: 'Борис, напоминаем о визите: удаление зуба 48', sentAt: '2026-11-14' },
  },
  {
    id: 'c-1063',
    name: 'Вера Макетова',
    birthYear: 1992,
    doctor: 'Д-р И. Примеров',
    scanDate: '2026-11-02',
    plan: {
      current: { tooth: 21, procedure: 'Керамический винир', date: '2026-11-25' },
      next: [
        { tooth: 11, procedure: 'Керамический винир', eta: '2026-12-09' },
        { tooth: 22, procedure: 'Отбеливание и полировка', eta: '2027-01-20' },
      ],
    },
    treated: [],
    mailing: { subject: 'Вера, 3D-снимок готов: начинаем с зуба 21', sentAt: '2026-11-15' },
  },
  {
    id: 'c-1071',
    name: 'Григорий Пробный',
    birthYear: 1964,
    doctor: 'Д-р С. Шаблонов',
    scanDate: '2026-11-05',
    plan: {
      current: { tooth: 46, procedure: 'Имплантация, установка импланта', date: '2026-11-27' },
      next: [
        { tooth: 15, procedure: 'Эндодонтическое лечение каналов', eta: '2026-12-15' },
        { tooth: 16, procedure: 'Коронка из диоксида циркония', eta: '2027-01-22' },
      ],
    },
    treated: [14, 24, 35, 45],
    mailing: { subject: 'Григорий, план имплантации зуба 46', sentAt: '2026-11-16' },
  },
  {
    id: 'c-1088',
    name: 'Дарья Черновикова',
    birthYear: 2001,
    doctor: 'Д-р М. Условная',
    scanDate: '2026-11-08',
    plan: {
      current: { tooth: 14, procedure: 'Лечение кариеса, пломба', date: '2026-11-21' },
      next: [
        { tooth: 24, procedure: 'Лечение кариеса, пломба', eta: '2026-12-05' },
        { tooth: 31, procedure: 'Профессиональная гигиена', eta: '2027-02-10' },
      ],
    },
    treated: [36],
    mailing: { subject: 'Дарья, что лечим сейчас и что дальше', sentAt: '2026-11-17' },
  },
  {
    id: 'c-1095',
    name: 'Евгений Демонстрационный',
    birthYear: 1981,
    doctor: 'Д-р С. Шаблонов',
    scanDate: '2026-11-10',
    plan: {
      current: { tooth: 27, procedure: 'Коронка из диоксида циркония', date: '2026-11-26' },
      next: [
        { tooth: 38, procedure: 'Удаление зуба мудрости', eta: '2026-12-12' },
        { tooth: 44, procedure: 'Эндодонтическое лечение каналов', eta: '2027-01-08' },
      ],
    },
    treated: [16, 26, 47],
    mailing: { subject: 'Евгений, ваш 3D-снимок и следующий этап — зуб 27', sentAt: '2026-11-18' },
  },
];

export function getClient(id) {
  return CLIENTS.find((c) => c.id === id) || null;
}
