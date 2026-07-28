import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveContact, missingCoinsForCard } from '../resolveContact';
import * as contactCardQDN from '../contactCardQDN';
import type { ChainConfig } from '../../config/chains';
import type { ContactCardLocalState } from '../Types';

vi.mock('../contactCardQDN');

const CHAIN_BTC: ChainConfig = {
  key: 'BTC',
  name: 'Bitcoin',
  ticker: 'BTC',
  coinEnum: 'BTC',
  route: 'bitcoin',
  defaultFee: 0.00001,
  isNative: false,
  decimalPlaces: 8,
  activeNetwork: 'MAIN',
  supportsHtlc: true,
  supportsLocalChainTrades: true,
};

const CHAIN_LTC: ChainConfig = { ...CHAIN_BTC, key: 'LTC', ticker: 'LTC' };

describe('resolveContact', () => {
  afterEach(() => {
    delete (global as any).qdnRequest;
    vi.clearAllMocks();
  });

  it('returns "name-not-found" when GET_NAME_DATA has no owner', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({ owner: null }));

    const result = await resolveContact('Nobody', 'BTC');
    expect(result).toEqual({ status: 'name-not-found', name: 'Nobody' });
  });

  it('returns "name-not-found" when GET_NAME_DATA rejects', async () => {
    (global as any).qdnRequest = vi.fn(async () => {
      throw new Error('not found');
    });
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    const result = await resolveContact('Nobody', 'BTC');
    expect(result.status).toBe('name-not-found');
  });

  it('returns "no-card" when the name exists but has no contact card', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({
      owner: 'Q-owner-address',
    }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    const result = await resolveContact('Alice', 'BTC');
    expect(result).toEqual({ status: 'no-card', name: 'Alice' });
  });

  it('returns "coin-not-published" when the card exists but lacks that coin', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({
      owner: 'Q-owner-address',
    }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'found',
      data: { version: 1, lastUpdated: 1, addresses: { LTC: 'ltc-address' } },
    });

    const result = await resolveContact('Alice', 'BTC');
    expect(result).toEqual({
      status: 'coin-not-published',
      name: 'Alice',
      coin: 'BTC',
    });
  });

  it('returns "resolved" with the address when the coin is published', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({
      owner: 'Q-owner-address',
    }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'found',
      data: { version: 1, lastUpdated: 1, addresses: { BTC: 'bc1qalice' } },
    });

    const result = await resolveContact('Alice', 'BTC');
    expect(result).toEqual({
      status: 'resolved',
      address: 'bc1qalice',
      coin: 'BTC',
      name: 'Alice',
    });
  });

  it('returns "fetch-failed" when the card fetch fails, even if the name exists', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({
      owner: 'Q-owner-address',
    }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'fetch-failed',
      error: new Error('node unreachable'),
    });

    const result = await resolveContact('Alice', 'BTC');
    expect(result).toEqual({ status: 'fetch-failed', name: 'Alice' });
  });

  it('trims whitespace from the provided name', async () => {
    const qdnMock = vi.fn(async () => ({ owner: 'Q-owner-address' }));
    (global as any).qdnRequest = qdnMock;
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    const result = await resolveContact('  Alice  ', 'BTC');
    expect(result).toEqual({ status: 'no-card', name: 'Alice' });
    expect(qdnMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice' })
    );
  });
});

describe('missingCoinsForCard', () => {
  it('returns chains with no saved decision', () => {
    const state: ContactCardLocalState = { BTC: { decision: 'published' } };
    expect(missingCoinsForCard(state, [CHAIN_BTC, CHAIN_LTC])).toEqual([
      CHAIN_LTC,
    ]);
  });

  it('does not flag a coin explicitly marked private', () => {
    const state: ContactCardLocalState = {
      BTC: { decision: 'published' },
      LTC: { decision: 'private' },
    };
    expect(missingCoinsForCard(state, [CHAIN_BTC, CHAIN_LTC])).toEqual([]);
  });

  it('returns all chains when local state is empty', () => {
    expect(missingCoinsForCard({}, [CHAIN_BTC, CHAIN_LTC])).toEqual([
      CHAIN_BTC,
      CHAIN_LTC,
    ]);
  });
});
