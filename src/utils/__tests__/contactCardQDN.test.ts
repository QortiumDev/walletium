import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchContactCard } from '../contactCardQDN';
import type { ContactCardQDNData } from '../Types';

describe('fetchContactCard', () => {
  let mockQdnRequest: ReturnType<typeof vi.fn>;

  afterEach(() => {
    delete (global as any).qdnRequest;
  });

  it('returns "found" with the parsed data when the resource exists', async () => {
    const data: ContactCardQDNData = {
      version: 1,
      lastUpdated: 1000,
      addresses: { BTC: 'bc1qalice' },
    };
    mockQdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      if (req.action === 'FETCH_QDN_RESOURCE') return data;
      throw new Error(`unexpected action ${req.action}`);
    });
    (global as any).qdnRequest = mockQdnRequest;

    const result = await fetchContactCard('Alice');

    expect(result).toEqual({ status: 'found', data });
    expect(mockQdnRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FETCH_QDN_RESOURCE',
        service: 'DOCUMENT',
        identifier: 'walletium-contactcard',
        name: 'Alice',
      })
    );
  });

  it('returns "not-found" on a 404-style error', async () => {
    mockQdnRequest = vi.fn(async () => {
      throw { error: 1401, message: '404 Not Found' };
    });
    (global as any).qdnRequest = mockQdnRequest;

    expect(await fetchContactCard('NoCardHere')).toEqual({
      status: 'not-found',
    });
  });

  it('returns "not-found" when the bridge resolves with no data', async () => {
    mockQdnRequest = vi.fn(async () => null);
    (global as any).qdnRequest = mockQdnRequest;

    expect(await fetchContactCard('Empty')).toEqual({ status: 'not-found' });
  });

  it('returns "fetch-failed" on a genuine, non-404 error', async () => {
    mockQdnRequest = vi.fn(async () => {
      throw new Error('node unreachable');
    });
    (global as any).qdnRequest = mockQdnRequest;

    const result = await fetchContactCard('Alice');
    expect(result.status).toBe('fetch-failed');
  });

  it('returns "fetch-failed" when the resource exists but is malformed (no addresses map)', async () => {
    mockQdnRequest = vi.fn(async () => ({ version: 1, lastUpdated: 1000 }));
    (global as any).qdnRequest = mockQdnRequest;

    const result = await fetchContactCard('Alice');
    expect(result.status).toBe('fetch-failed');
  });
});
