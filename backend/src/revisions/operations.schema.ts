import { z } from 'zod';

import { ASSUMPTION_KEYS } from '../costing/assumptions';

const uuid = z.string().uuid();
const positiveAmount = z.string().regex(/^\d+(\.\d{1,4})?$/, 'must be a positive number');
const nonNegativeAmount = z.string().regex(/^\d+(\.\d{1,8})?$/, 'must be zero or more');
/** Units sold: zero or more, up to the 4 decimal places the database keeps. */
const unitsSold = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, 'must be zero or more');
/** A cost per portion, up to the 4 decimal places the database keeps. */
const portionCost = z.string().regex(/^\d{1,8}(\.\d{1,4})?$/, 'must be zero or more');
const unit = z.string().trim().min(1).max(20);
const name = z.string().trim().min(1).max(200);

/**
 * Every change to a job's analysis inputs is one of these operations. They are the only way
 * data changes after processing: the chat proposes them, the client confirms, and the backend
 * validates and applies them (docs/API_SPECIFICATION.md → Revisions).
 */
export const operationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('SET_SELLING_PRICE'), menuItemId: uuid, grossPrice: positiveAmount }),
  z.object({ op: z.literal('RENAME_MENU_ITEM'), menuItemId: uuid, name }),
  z.object({ op: z.literal('SET_UNITS_SOLD'), menuItemId: uuid, quantity: unitsSold }),
  z.object({
    op: z.literal('SET_ITEM_COST'),
    menuItemId: uuid,
    /** The cost of one portion, entered by hand. null removes it, so the recipe decides again. */
    cost: portionCost.nullable(),
  }),
  z.object({ op: z.literal('ADD_MENU_ITEM'), name, category: z.string().trim().max(100).nullish(), grossPrice: positiveAmount.nullish() }),
  z.object({
    op: z.literal('ADD_RECIPE_LINE'),
    menuItemId: uuid,
    ingredientId: uuid,
    quantity: positiveAmount,
    unit,
  }),
  z.object({ op: z.literal('SET_RECIPE_LINE'), recipeLineId: uuid, quantity: positiveAmount, unit }),
  z.object({ op: z.literal('REMOVE_RECIPE_LINE'), recipeLineId: uuid }),
  z.object({
    op: z.literal('SET_INGREDIENT_PRICE'),
    ingredientId: uuid,
    price: nonNegativeAmount,
    unit,
  }),
  z.object({ op: z.literal('SET_ASSUMPTION'), key: z.enum(ASSUMPTION_KEYS), value: z.unknown() }),
  z.object({
    op: z.literal('MAP_POS_ITEM'),
    matchId: uuid,
    /** null rejects the suggestion and leaves the POS item unmatched. */
    menuItemId: uuid.nullable(),
  }),
]);

export const operationsSchema = z.array(operationSchema).min(1).max(200);

export type Operation = z.infer<typeof operationSchema>;
export type OperationKind = Operation['op'];
