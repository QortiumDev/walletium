// @vitest-environment happy-dom
import type { ReactNode } from 'react';
import { Provider, createStore } from 'jotai';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { walletReadyAtom, pinnedAssetIdsAtom } from '../../state/global/system';
import { useAssetHoldings } from '../useAssetHoldings';

function wrapper(store: ReturnType<typeof createStore>) {
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
}

describe('useAssetHoldings', () => {
  let qdnRequestMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    qdnRequestMock = vi.fn();
    (globalThis as any).qdnRequest = qdnRequestMock;
  });

  it('loads held assets via GET_ASSET_BALANCES and GET_ASSET_INFO, not FETCH_NODE_API', async () => {
    qdnRequestMock.mockImplementation((opts: Record<string, unknown>) => {
      if (opts.action === 'GET_USER_WALLET') return Promise.resolve({ address: 'Qholder' });
      if (opts.action === 'GET_ASSET_BALANCES') {
        expect(opts).toMatchObject({ address: 'Qholder', excludeZero: true, limit: 0 });
        return Promise.resolve([{ address: 'Qholder', assetId: 7, balance: '250000000' }]);
      }
      if (opts.action === 'GET_ASSET_INFO') {
        expect(opts).toMatchObject({ assetId: 7 });
        return Promise.resolve({
          assetId: 7,
          owner: 'Qissuer',
          name: 'GOLD',
          quantity: '1000000000000',
          isDivisible: true,
          isUnspendable: false,
          creationGroupId: 0,
          isOwnerForSale: false,
        });
      }
      throw new Error(`unexpected action: ${opts.action}`);
    });

    const store = createStore();
    store.set(walletReadyAtom, true);

    const { result } = renderHook(() => useAssetHoldings(), { wrapper: wrapper(store) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assets).toHaveLength(1);
    expect(result.current.assets[0]).toMatchObject({ assetId: 7, name: 'GOLD', balance: '250000000' });
    expect(qdnRequestMock.mock.calls.some(([opts]) => opts.action === 'FETCH_NODE_API')).toBe(false);
  });

  it('pinAsset resolves an assetName selector to the asset id before storing it', async () => {
    qdnRequestMock.mockImplementation((opts: Record<string, unknown>) => {
      if (opts.action === 'GET_USER_WALLET') return Promise.resolve({ address: 'Qholder' });
      if (opts.action === 'GET_ASSET_BALANCES') return Promise.resolve([]);
      if (opts.action === 'GET_ASSET_INFO') {
        expect(opts).toMatchObject({ assetName: 'SILVER' });
        return Promise.resolve({
          assetId: 9,
          owner: 'Qissuer',
          name: 'SILVER',
          quantity: '500',
          isDivisible: false,
          isUnspendable: false,
          creationGroupId: 0,
          isOwnerForSale: false,
        });
      }
      throw new Error(`unexpected action: ${opts.action}`);
    });

    const store = createStore();
    store.set(walletReadyAtom, true);

    const { result } = renderHook(() => useAssetHoldings(), { wrapper: wrapper(store) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pinResult: { ok: boolean };
    await act(async () => {
      pinResult = await result.current.pinAsset({ assetName: 'SILVER' });
    });

    expect(pinResult!.ok).toBe(true);
    expect(store.get(pinnedAssetIdsAtom)).toEqual([9]);
  });

  it('pinAsset reports a clear error when the asset cannot be resolved', async () => {
    qdnRequestMock.mockImplementation((opts: Record<string, unknown>) => {
      if (opts.action === 'GET_USER_WALLET') return Promise.resolve({ address: 'Qholder' });
      if (opts.action === 'GET_ASSET_BALANCES') return Promise.resolve([]);
      if (opts.action === 'GET_ASSET_INFO') return Promise.reject(new Error('not found'));
      throw new Error(`unexpected action: ${opts.action}`);
    });

    const store = createStore();
    store.set(walletReadyAtom, true);

    const { result } = renderHook(() => useAssetHoldings(), { wrapper: wrapper(store) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pinResult: { ok: boolean; error?: string };
    await act(async () => {
      pinResult = await result.current.pinAsset({ assetId: 404 });
    });

    expect(pinResult!.ok).toBe(false);
    expect(pinResult!.error).toBe('Asset not found');
    expect(store.get(pinnedAssetIdsAtom)).toEqual([]);
  });
});
