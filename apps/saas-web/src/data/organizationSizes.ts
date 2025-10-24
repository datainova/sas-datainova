import type { OrganizationSizeOption } from "../types/onboarding";

export const organizationSizes: OrganizationSizeOption[] = [
  {
    value: "SIZE_1_10",
    label: "1–10 pessoas",
    description: "Time fundador e primeiras contratações."
  },
  {
    value: "SIZE_11_50",
    label: "11–50 pessoas",
    description: "Escalando operação com squads enxutos."
  },
  {
    value: "SIZE_51_200",
    label: "51–200 pessoas",
    description: "Estrutura consolidada e times multifuncionais."
  },
  {
    value: "SIZE_201_1000",
    label: "201–1.000 pessoas",
    description: "Expansão regional e governança formal."
  },
  {
    value: "SIZE_1001_PLUS",
    label: "1.001+ pessoas",
    description: "Grupo corporativo com várias unidades."
  }
];
