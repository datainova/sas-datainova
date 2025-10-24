import type { SegmentOption } from "../types/onboarding";

export const defaultSegments: SegmentOption[] = [
  { value: "technology", label: "Tecnologia" },
  { value: "financial-services", label: "Serviços Financeiros" },
  { value: "retail", label: "Varejo" },
  { value: "industry", label: "Indústria" },
  { value: "healthcare", label: "Saúde" },
  { value: "education", label: "Educação" },
  { value: "agriculture", label: "Agronegócio" },
  { value: "media", label: "Mídia & Comunicação" },
  { value: "professional-services", label: "Serviços Profissionais" },
  { value: "public-sector", label: "Setor Público" }
];

export function slugifySegment(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
