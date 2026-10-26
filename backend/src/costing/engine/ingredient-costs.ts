import { Decimal, sum } from '../../common/decimal';
import { incomplete, known, worst } from './confidence';
import type { EngineIngredient, EnginePrice, Metric, PriceBasis } from './types';

/**
 * The cost per base unit (g / ml / each) used for an ingredient.
 * A price entered by the client always wins over invoice evidence; otherwise the
 * configured basis picks from the invoice prices.
 */
export function ingredientUnitCost(ingredient: EngineIngredient, basis: PriceBasis): Metric {
  const userPrices = ingredient.prices.filter((price) => price.source === 'USER');
  if (userPrices.length) {
    const latest = [...userPrices].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return known(latest.pricePerBaseUnit, 'PARTIALLY_VERIFIED', [
      `Price of ${ingredient.name} entered by you`,
    ]);
  }

  const invoicePrices = ingredient.prices.filter((price) => price.source === 'INVOICE');
  if (!invoicePrices.length) return incomplete(`${ingredient.name} has no price`);

  const confidence = worst(...invoicePrices.map((price) => price.confidence));
  const reasons =
    confidence === 'VERIFIED' ? [] : [`Invoice price of ${ingredient.name} is uncertain`];
  return known(pickPrice(invoicePrices, basis), confidence, reasons);
}

function pickPrice(prices: EnginePrice[], basis: PriceBasis): Decimal {
  if (basis === 'MAX') {
    return prices.reduce((max, price) => Decimal.max(max, price.pricePerBaseUnit), prices[0].pricePerBaseUnit);
  }
  if (basis === 'WEIGHTED_AVG') {
    const weighted = prices.filter((price) => price.baseQuantity && price.baseQuantity.gt(0));
    if (weighted.length) {
      const totalQuantity = sum(weighted.map((price) => price.baseQuantity as Decimal));
      const totalCost = sum(weighted.map((price) => price.pricePerBaseUnit.times(price.baseQuantity as Decimal)));
      return totalCost.dividedBy(totalQuantity);
    }
  }
  return latestPrice(prices).pricePerBaseUnit;
}

/** Most recent invoice date first; undated prices count as oldest. */
function latestPrice(prices: EnginePrice[]): EnginePrice {
  return [...prices].sort((a, b) => {
    const byDate = (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
    return byDate !== 0 ? byDate : b.createdAt.getTime() - a.createdAt.getTime();
  })[0];
}
