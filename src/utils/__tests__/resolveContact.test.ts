import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveContact } from '../resolveContact';
import * as contactCardQDN from '../contactCardQDN';

vi.mock('../contactCardQDN');

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
