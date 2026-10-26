import { Decimal } from '../common/decimal';
import { Problems } from '../common/problem';
import { ASSUMPTION_VALUE_SCHEMAS } from '../costing/assumptions';
import type { Db } from '../costing/engine-input.loader';
import { normalizeName } from '../normalization/names';
import { toBaseQuantity } from '../normalization/units';
import type { Operation } from './operations.schema';

export type OperationEffect = { description: string; before: unknown; after: unknown };

/**
 * Applies one operation inside a transaction and returns a human-readable description of
 * what changed. Every lookup is scoped by jobId, so an operation can never reach another
 * job's data even if the caller supplies a foreign id.
 */
export async function applyOperation(
  db: Db,
  jobId: string,
  revision: number,
  operation: Operation,
): Promise<OperationEffect> {
  switch (operation.op) {
    case 'SET_SELLING_PRICE': {
      const item = await findMenuItem(db, jobId, operation.menuItemId);
      const grossPrice = new Decimal(operation.grossPrice);
      await db.menuItem.update({
        where: { id: item.id },
        data: { grossPrice, confidence: 'PARTIALLY_VERIFIED', origin: 'USER' },
      });
      return {
        description: `Selling price of ${item.name} set to ${grossPrice.toFixed(2)}`,
        before: item.grossPrice?.toString() ?? null,
        after: grossPrice.toString(),
      };
    }

    case 'ADD_MENU_ITEM': {
      const normalizedName = normalizeName(operation.name);
      const existing = await db.menuItem.findFirst({ where: { jobId, normalizedName } });
      if (existing) throw Problems.validation(`"${operation.name}" is already on the menu.`);
      const created = await db.menuItem.create({
        data: {
          jobId,
          name: operation.name,
          normalizedName,
          category: operation.category ?? null,
          grossPrice: operation.grossPrice ? new Decimal(operation.grossPrice) : null,
          confidence: 'PARTIALLY_VERIFIED',
          origin: 'USER',
        },
      });
      return { description: `Menu item ${created.name} added`, before: null, after: created.id };
    }

    case 'ADD_RECIPE_LINE': {
      const [item, ingredient] = await Promise.all([
        findMenuItem(db, jobId, operation.menuItemId),
        findIngredient(db, jobId, operation.ingredientId),
      ]);
      const baseQuantity = convert(operation.quantity, operation.unit, ingredient.baseUnit, ingredient.name);
      const existing = await db.recipeLine.findFirst({
        where: { jobId, menuItemId: item.id, ingredientId: ingredient.id },
      });
      if (existing) {
        await db.recipeLine.update({
          where: { id: existing.id },
          data: { quantity: new Decimal(operation.quantity), unit: operation.unit, baseQuantity, source: 'USER' },
        });
        return {
          description: `${ingredient.name} in ${item.name} set to ${operation.quantity} ${operation.unit}`,
          before: `${existing.quantity.toString()} ${existing.unit}`,
          after: `${operation.quantity} ${operation.unit}`,
        };
      }
      await db.recipeLine.create({
        data: {
          jobId,
          menuItemId: item.id,
          ingredientId: ingredient.id,
          quantity: new Decimal(operation.quantity),
          unit: operation.unit,
          baseQuantity,
          source: 'USER',
        },
      });
      return {
        description: `${operation.quantity} ${operation.unit} of ${ingredient.name} added to ${item.name}`,
        before: null,
        after: `${operation.quantity} ${operation.unit}`,
      };
    }

    case 'SET_RECIPE_LINE': {
      const line = await db.recipeLine.findFirst({
        where: { id: operation.recipeLineId, jobId },
        include: { ingredient: true, menuItem: { select: { name: true } } },
      });
      if (!line) throw Problems.validation('That recipe line no longer exists.');
      const baseQuantity = convert(operation.quantity, operation.unit, line.ingredient.baseUnit, line.ingredient.name);
      await db.recipeLine.update({
        where: { id: line.id },
        data: { quantity: new Decimal(operation.quantity), unit: operation.unit, baseQuantity, source: 'USER' },
      });
      return {
        description: `${line.ingredient.name} in ${line.menuItem.name} set to ${operation.quantity} ${operation.unit}`,
        before: `${line.quantity.toString()} ${line.unit}`,
        after: `${operation.quantity} ${operation.unit}`,
      };
    }

    case 'REMOVE_RECIPE_LINE': {
      const line = await db.recipeLine.findFirst({
        where: { id: operation.recipeLineId, jobId },
        include: { ingredient: { select: { name: true } }, menuItem: { select: { name: true } } },
      });
      if (!line) throw Problems.validation('That recipe line no longer exists.');
      await db.recipeLine.delete({ where: { id: line.id } });
      return {
        description: `${line.ingredient.name} removed from ${line.menuItem.name}`,
        before: `${line.quantity.toString()} ${line.unit}`,
        after: null,
      };
    }

    case 'SET_INGREDIENT_PRICE': {
      const ingredient = await findIngredient(db, jobId, operation.ingredientId);
      const perBaseUnit = pricePerBaseUnit(operation.price, operation.unit, ingredient.baseUnit, ingredient.name);
      const previous = await db.ingredientPrice.findFirst({
        where: { jobId, ingredientId: ingredient.id, source: 'USER' },
        orderBy: { createdAt: 'desc' },
      });
      await db.ingredientPrice.create({
        data: {
          jobId,
          ingredientId: ingredient.id,
          source: 'USER',
          pricePerBaseUnit: perBaseUnit,
          revisionNumber: revision,
        },
      });
      return {
        description: `Price of ${ingredient.name} set to ${operation.price} per ${operation.unit}`,
        before: previous?.pricePerBaseUnit.toString() ?? null,
        after: perBaseUnit.toString(),
      };
    }

    case 'SET_ASSUMPTION': {
      const parsed = ASSUMPTION_VALUE_SCHEMAS[operation.key].safeParse(operation.value);
      if (!parsed.success) {
        throw Problems.validation(`${operation.key}: ${parsed.error.issues[0]?.message ?? 'invalid value'}`);
      }
      const previous = await db.assumption.findUnique({ where: { jobId_key: { jobId, key: operation.key } } });
      await db.assumption.upsert({
        where: { jobId_key: { jobId, key: operation.key } },
        create: { jobId, key: operation.key, value: parsed.data as never, source: 'USER', revisionNumber: revision },
        update: { value: parsed.data as never, source: 'USER', revisionNumber: revision },
      });
      return {
        description: `${ASSUMPTION_LABELS[operation.key]} set to ${String(parsed.data)}`,
        before: previous?.value ?? null,
        after: parsed.data,
      };
    }

    case 'MAP_POS_ITEM': {
      const match = await db.matchSuggestion.findFirst({ where: { id: operation.matchId, jobId } });
      if (!match) throw Problems.validation('That POS item is no longer waiting for a decision.');
      const item = operation.menuItemId ? await findMenuItem(db, jobId, operation.menuItemId) : null;
      await db.matchSuggestion.update({
        where: { id: match.id },
        data: {
          candidateId: item?.id ?? null,
          method: 'USER',
          status: item ? 'APPROVED' : 'REJECTED',
          decidedInRevision: revision,
        },
      });
      await db.posSalesLine.updateMany({
        where: { jobId, normalizedName: match.posNormalizedName },
        data: { menuItemId: item?.id ?? null },
      });
      return {
        description: item
          ? `POS item "${match.posDisplayName}" linked to ${item.name}`
          : `POS item "${match.posDisplayName}" left unlinked`,
        before: match.candidateId,
        after: item?.id ?? null,
      };
    }
  }
}

const ASSUMPTION_LABELS: Record<string, string> = {
  VAT_RATE: 'VAT rate',
  VAT_RATE_DRINK: 'VAT rate for drinks',
  MENU_PRICES_INCLUDE_VAT: 'Menu prices include VAT',
  PRICE_BASIS: 'Ingredient price basis',
  WASTAGE_PCT: 'Wastage allowance',
};

async function findMenuItem(db: Db, jobId: string, menuItemId: string) {
  const item = await db.menuItem.findFirst({ where: { id: menuItemId, jobId } });
  if (!item) throw Problems.validation('That menu item does not exist in this analysis.');
  return item;
}

async function findIngredient(db: Db, jobId: string, ingredientId: string) {
  const ingredient = await db.ingredient.findFirst({ where: { id: ingredientId, jobId } });
  if (!ingredient) throw Problems.validation('That ingredient does not exist in this analysis.');
  return ingredient;
}

function convert(quantity: string, unit: string, baseUnit: string, ingredientName: string): Decimal {
  const base = toBaseQuantity(new Decimal(quantity), unit, baseUnit as never);
  if (!base) {
    throw Problems.validation(
      `"${unit}" can't be converted to the unit ${ingredientName} is measured in (${baseUnit.toLowerCase()}).`,
    );
  }
  return base;
}

/** "8.40 per kg" → price per base unit (per gram). */
function pricePerBaseUnit(price: string, unit: string, baseUnit: string, ingredientName: string): Decimal {
  const oneUnitInBase = convert('1', unit, baseUnit, ingredientName);
  return new Decimal(price).dividedBy(oneUnitInBase);
}
