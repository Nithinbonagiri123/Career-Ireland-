import { z } from 'zod';

export const CurrencyCodeSchema = z
  .string()
  .length(3, 'Currency code must be 3 letters (ISO 4217)')
  .regex(/^[A-Z]+$/, 'Uppercase letters only')
  .transform((s) => s.toUpperCase());

export const UpsertCurrencySchema = z.object({
  code: CurrencyCodeSchema,
  name: z.string().min(2).max(60),
  symbol: z.string().min(1).max(5),
  isActive: z.boolean(),
});

export const SetCurrencyActiveSchema = z.object({
  code: CurrencyCodeSchema,
  isActive: z.boolean(),
});

export type UpsertCurrencyInput = z.infer<typeof UpsertCurrencySchema>;
export type SetCurrencyActiveInput = z.infer<typeof SetCurrencyActiveSchema>;
