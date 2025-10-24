import type { CountryOption } from "../types/onboarding";

export const countries: CountryOption[] = [
  {
    code: "BR",
    name: "Brasil",
    timezone: "America/Sao_Paulo",
    currency: "BRL",
    locale: "pt-BR"
  },
  {
    code: "US",
    name: "Estados Unidos",
    timezone: "America/New_York",
    currency: "USD",
    locale: "en-US"
  },
  {
    code: "CA",
    name: "Canadá",
    timezone: "America/Toronto",
    currency: "CAD",
    locale: "en-CA"
  },
  {
    code: "GB",
    name: "Reino Unido",
    timezone: "Europe/London",
    currency: "GBP",
    locale: "en-GB"
  },
  {
    code: "DE",
    name: "Alemanha",
    timezone: "Europe/Berlin",
    currency: "EUR",
    locale: "de-DE"
  },
  {
    code: "FR",
    name: "França",
    timezone: "Europe/Paris",
    currency: "EUR",
    locale: "fr-FR"
  },
  {
    code: "ES",
    name: "Espanha",
    timezone: "Europe/Madrid",
    currency: "EUR",
    locale: "es-ES"
  },
  {
    code: "PT",
    name: "Portugal",
    timezone: "Europe/Lisbon",
    currency: "EUR",
    locale: "pt-PT"
  },
  {
    code: "MX",
    name: "México",
    timezone: "America/Mexico_City",
    currency: "MXN",
    locale: "es-MX"
  },
  {
    code: "AR",
    name: "Argentina",
    timezone: "America/Argentina/Buenos_Aires",
    currency: "ARS",
    locale: "es-AR"
  },
  {
    code: "CL",
    name: "Chile",
    timezone: "America/Santiago",
    currency: "CLP",
    locale: "es-CL"
  },
  {
    code: "CO",
    name: "Colômbia",
    timezone: "America/Bogota",
    currency: "COP",
    locale: "es-CO"
  },
  {
    code: "AU",
    name: "Austrália",
    timezone: "Australia/Sydney",
    currency: "AUD",
    locale: "en-AU"
  },
  {
    code: "JP",
    name: "Japão",
    timezone: "Asia/Tokyo",
    currency: "JPY",
    locale: "ja-JP"
  },
  {
    code: "IN",
    name: "Índia",
    timezone: "Asia/Kolkata",
    currency: "INR",
    locale: "en-IN"
  }
];

export function findCountry(code: string | null | undefined) {
  if (!code) {
    return undefined;
  }
  const normalized = code.trim().toUpperCase();
  return countries.find((country) => country.code === normalized);
}
