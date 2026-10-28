import { toAssumptionsJson } from './assumptions';

describe('toAssumptionsJson', () => {
  it('reports the defaults when nothing is stored', () => {
    expect(toAssumptionsJson([])).toEqual({
      vatRate: null,
      vatRateDrink: null,
      menuPricesIncludeVat: true,
      priceBasis: 'LATEST',
      wastagePct: '0',
    });
  });

  it('reports what the client has set', () => {
    expect(
      toAssumptionsJson([
        { key: 'VAT_RATE', value: '0.135' },
        { key: 'VAT_RATE_DRINK', value: '0.23' },
        { key: 'MENU_PRICES_INCLUDE_VAT', value: false },
        { key: 'PRICE_BASIS', value: 'MAX' },
        { key: 'WASTAGE_PCT', value: '0.05' },
      ]),
    ).toEqual({
      vatRate: '0.135',
      vatRateDrink: '0.23',
      menuPricesIncludeVat: false,
      priceBasis: 'MAX',
      wastagePct: '0.05',
    });
  });
});
