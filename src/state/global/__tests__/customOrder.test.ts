import { describe, expect, it } from 'vitest';
import { migrateLegacyCustomOrder } from '../system';

describe('migrateLegacyCustomOrder', () => {
  it('remaps pre-network-qualification asset keys onto the qortium network', () => {
    expect(migrateLegacyCustomOrder(['asset:7', 'BTC', 'asset:42'])).toEqual([
      'asset:qortium:7',
      'BTC',
      'asset:qortium:42',
    ]);
  });

  it('leaves already-qualified asset keys and chain keys untouched', () => {
    const order = ['asset:qortium:7', 'asset:qortal:9', 'BTC', 'LTC'];
    expect(migrateLegacyCustomOrder(order)).toEqual(order);
  });

  it('is a no-op on an empty order', () => {
    expect(migrateLegacyCustomOrder([])).toEqual([]);
  });
});
