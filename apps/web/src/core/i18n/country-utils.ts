import { countryMetadata } from './country-metadata';

type CountryInfo = {
  code: string;
  label: string;
  currency?: string;
  timezone?: string;
  locale?: string;
};

const LANGUAGE_CODE_OVERRIDES: Record<string, string> = {
  afr: 'af',
  amh: 'am',
  ara: 'ar',
  aze: 'az',
  bel: 'be',
  ben: 'bn',
  bos: 'bs',
  bul: 'bg',
  cat: 'ca',
  ces: 'cs',
  cym: 'cy',
  dan: 'da',
  deu: 'de',
  dzo: 'dz',
  ell: 'el',
  eng: 'en',
  est: 'et',
  fas: 'fa',
  fin: 'fi',
  fra: 'fr',
  gle: 'ga',
  glg: 'gl',
  guj: 'gu',
  hat: 'ht',
  heb: 'he',
  hin: 'hi',
  hrv: 'hr',
  hun: 'hu',
  ind: 'id',
  isl: 'is',
  ita: 'it',
  jpn: 'ja',
  kat: 'ka',
  khm: 'km',
  kir: 'ky',
  kor: 'ko',
  lav: 'lv',
  lit: 'lt',
  ltz: 'lb',
  mkd: 'mk',
  mlt: 'mt',
  msa: 'ms',
  mya: 'my',
  nep: 'ne',
  nld: 'nl',
  nor: 'no',
  pan: 'pa',
  pol: 'pl',
  por: 'pt',
  pus: 'ps',
  ron: 'ro',
  rus: 'ru',
  sin: 'si',
  slk: 'sk',
  slv: 'sl',
  som: 'so',
  spa: 'es',
  sqi: 'sq',
  srp: 'sr',
  swe: 'sv',
  tam: 'ta',
  tel: 'te',
  tha: 'th',
  tgl: 'tl',
  tur: 'tr',
  ukr: 'uk',
  urd: 'ur',
  uzb: 'uz',
  vie: 'vi',
  zho: 'zh',
  zul: 'zu'
};

const regionDisplayNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['pt-BR', 'en'], { type: 'region' })
    : undefined;

const toLocaleCode = (rawLocale: string | null, code: string) => {
  if (!rawLocale) return undefined;
  const [languageId] = rawLocale.split('-');
  const normalized =
    LANGUAGE_CODE_OVERRIDES[languageId] ?? (languageId ? languageId.slice(0, 2) : undefined);
  if (!normalized) return undefined;
  return `${normalized}-${code}`;
};

const toLabel = (code: string, fallback: string) => {
  const displayName = regionDisplayNames?.of(code);
  if (displayName) return displayName;
  if (fallback) return fallback;
  return code;
};

export const countryOptions: CountryInfo[] = countryMetadata
  .map((country) => ({
    code: country.code,
    label: toLabel(country.code, country.englishName),
    currency: country.currency ?? undefined,
    timezone: country.timezone ?? undefined,
    locale: toLocaleCode(country.locale, country.code)
  }))
  .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

export const findCountryOption = (code?: string | null): CountryInfo | undefined => {
  if (!code) return undefined;
  return countryOptions.find((country) => country.code === code.toUpperCase());
};

export const detectBrowserCountry = (): string | null => {
  if (typeof navigator === 'undefined') return null;
  const locales = [...(navigator.languages ?? []), navigator.language].filter(Boolean);

  for (const locale of locales) {
    if (!locale) continue;
    const segments = locale.split(/[-_]/);
    const region = segments[1] ?? segments[0]?.slice(-2);
    if (region && region.length === 2) {
      return region.toUpperCase();
    }
  }

  return null;
};

export type { CountryInfo };
