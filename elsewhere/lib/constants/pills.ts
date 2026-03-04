export const ALLOWED_PILLS = [
  'study rooms',
  'public computers',
  'morning rush',
  'cozy nooks',
  'outdoor seating',
  'good lighting',
  'fast wifi',
  'standing desks',
  'wheelchair accessible',
  'kid friendly',
  'dog friendly',
  'late night',
  'group friendly',
  'solo friendly',
] as const;

export type PillKey = (typeof ALLOWED_PILLS)[number];
