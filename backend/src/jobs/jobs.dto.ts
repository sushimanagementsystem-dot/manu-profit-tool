import { z } from 'zod';

import { ASSUMPTION_VALUE_SCHEMAS } from '../costing/assumptions';

export const createJobSchema = z.object({
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code')
    .default('EUR'),
});

export const submitJobSchema = z.object({
  assumptions: z
    .object({
      vatRate: ASSUMPTION_VALUE_SCHEMAS.VAT_RATE.optional(),
      vatRateDrink: ASSUMPTION_VALUE_SCHEMAS.VAT_RATE_DRINK.optional(),
      menuPricesIncludeVat: ASSUMPTION_VALUE_SCHEMAS.MENU_PRICES_INCLUDE_VAT.optional(),
    })
    .default({}),
});

export type CreateJobDto = z.infer<typeof createJobSchema>;
export type SubmitJobDto = z.infer<typeof submitJobSchema>;
