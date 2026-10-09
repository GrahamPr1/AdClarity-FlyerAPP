// The 8 NOP templates. Its own module (no fs) so client components can import it.
export const NOP_TEMPLATES = [
  "NOP_P1_EN", "NOP_P1_ES", "NOP_P2_EN", "NOP_P2_ES", "NOP_P3_EN", "NOP_P3_ES", "NOP_ALL_EN", "NOP_ALL_ES",
] as const
export type NopTemplateId = (typeof NOP_TEMPLATES)[number]
