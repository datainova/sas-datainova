import type { Cadence } from '@prisma/client';

export const cadenceHierarchy: Cadence[] = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
  'BIENNIAL'
];

export const compareCadence = (child: Cadence, parent: Cadence) =>
  cadenceHierarchy.indexOf(child) - cadenceHierarchy.indexOf(parent);
