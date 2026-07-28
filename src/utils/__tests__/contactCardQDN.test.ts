import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// Override the global qapp-core mock (from setup.ts) to include objectToBase64,
// which contactCardQDN.ts uses to encode the publish payload. The mock keeps
// the encoded output inspectable (JSON string) so tests can assert on shape.
vi.mock('qapp-core', () => ({
  objectToBase64: vi.fn(async (obj: unknown) => JSON.stringify(obj)),
}));

import {
  debouncedPublishContactCard,
  fetchContactCard,
  publishContactCard,
} from '../contactCardQDN';
import type { ContactCardLocalState, ContactCardQDNData } from '../Types';

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

describe('publishContactCard', () => {
  let calls: Array<Record<string, unknown>>;
  let mockQdnRequest: ReturnType<typeof vi.fn>;

  const LOCAL_STATE: ContactCardLocalState = {
    BTC: { decision: 'published' },
    LTC: { decision: 'private' },
    DOGE: { decision: 'published', overrideAddress: 'D-cold-storage' },
  };

  beforeEach(() => {
    calls = [];
    mockQdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      calls.push(req);
      switch (req.action) {
        case 'UNLOCK_SELECTED_ACCOUNT':
          return { isUnlocked: true };
        case 'GET_USER_WALLET':
          if (req.coin === 'BTC') return { address: 'bc1qmywalletaddress' };
          return { address: null };
        case 'DELETE_QDN_RESOURCE':
          return { success: true };
        case 'PUBLISH_QDN_RESOURCE':
          return { success: true };
        default:
          throw new Error(`unexpected action ${req.action}`);
      }
    });
    (global as any).qdnRequest = mockQdnRequest;
  });

  afterEach(() => {
    delete (global as any).qdnRequest;
    vi.useRealTimers();
  });

  it('publishes only coins marked "published", using the wallet address or override', async () => {
    const result = await publishContactCard(LOCAL_STATE, 'Alice');

    expect(result).not.toBeNull();
    const publishCall = calls.find((c) => c.action === 'PUBLISH_QDN_RESOURCE')!;
    expect(publishCall.name).toBe('Alice');
    expect(publishCall.service).toBe('DOCUMENT');
    expect(publishCall.identifier).toBe('walletium-contactcard');
    const publishedData = JSON.parse(publishCall.base64 as string);
    expect(publishedData).toMatchObject({
      version: 1,
      addresses: { BTC: 'bc1qmywalletaddress', DOGE: 'D-cold-storage' },
    });
  });

  it('never includes a "private" coin in the published addresses', async () => {
    await publishContactCard(LOCAL_STATE, 'Alice');
    const publishCall = calls.find((c) => c.action === 'PUBLISH_QDN_RESOURCE')!;
    const publishedData = JSON.parse(publishCall.base64 as string);
    expect(publishedData.addresses).not.toHaveProperty('LTC');
  });

  it('deletes the old resource before publishing the new one, in that order', async () => {
    await publishContactCard(LOCAL_STATE, 'Alice');
    const deleteIndex = calls.findIndex(
      (c) => c.action === 'DELETE_QDN_RESOURCE'
    );
    const publishIndex = calls.findIndex(
      (c) => c.action === 'PUBLISH_QDN_RESOURCE'
    );
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeLessThan(publishIndex);
  });

  it('still publishes when the delete fails (nothing to delete on first publish)', async () => {
    mockQdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      calls.push(req);
      if (req.action === 'DELETE_QDN_RESOURCE') throw { error: 1401 };
      if (req.action === 'UNLOCK_SELECTED_ACCOUNT') return { isUnlocked: true };
      if (req.action === 'GET_USER_WALLET')
        return { address: 'bc1qmywalletaddress' };
      return { success: true };
    });
    (global as any).qdnRequest = mockQdnRequest;

    const result = await publishContactCard(LOCAL_STATE, 'Alice');
    expect(result).not.toBeNull();
    expect(calls.some((c) => c.action === 'PUBLISH_QDN_RESOURCE')).toBe(true);
  });

  it('returns null and does not publish when the account cannot be unlocked', async () => {
    mockQdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      calls.push(req);
      if (req.action === 'UNLOCK_SELECTED_ACCOUNT')
        return { isUnlocked: false };
      return { success: true };
    });
    (global as any).qdnRequest = mockQdnRequest;

    const result = await publishContactCard(LOCAL_STATE, 'Alice');
    expect(result).toBeNull();
    expect(calls.some((c) => c.action === 'PUBLISH_QDN_RESOURCE')).toBe(false);
  });
});

describe('debouncedPublishContactCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete (global as any).qdnRequest;
    vi.useRealTimers();
  });

  it('collapses multiple rapid calls into a single publish', async () => {
    const calls: string[] = [];
    (global as any).qdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      calls.push(req.action as string);
      if (req.action === 'UNLOCK_SELECTED_ACCOUNT') return { isUnlocked: true };
      if (req.action === 'GET_USER_WALLET') return { address: 'addr' };
      return { success: true };
    });

    const state: ContactCardLocalState = { BTC: { decision: 'published' } };
    debouncedPublishContactCard(state, 'Alice', 50);
    debouncedPublishContactCard(state, 'Alice', 50);
    debouncedPublishContactCard(state, 'Alice', 50);

    await vi.advanceTimersByTimeAsync(60);

    expect(calls.filter((a) => a === 'PUBLISH_QDN_RESOURCE')).toHaveLength(1);
  });
});
