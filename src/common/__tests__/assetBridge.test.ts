import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  availableAssetNetworks,
  requestAssetActions,
  requestAssetInfo,
  requestAssetRead,
  requestAssetTransfer,
  requestAssetWallet,
} from '../assetBridge';

describe('assetBridge', () => {
  beforeEach(() => {
    delete (globalThis as any).qdnRequest;
    delete (globalThis as any).qortalRequest;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (globalThis as any).qdnRequest;
    delete (globalThis as any).qortalRequest;
  });

  it('keeps Qortium and Qortal asset requests on their selected protocols', async () => {
    const qdnMock = vi.fn().mockResolvedValue({ address: 'QortiumAddress' });
    const qortalMock = vi.fn().mockResolvedValue({ address: 'QortalAddress' });
    (globalThis as any).qdnRequest = qdnMock;
    (globalThis as any).qortalRequest = qortalMock;

    expect(availableAssetNetworks()).toEqual(['qortium', 'qortal']);
    await requestAssetWallet('qortium');
    await requestAssetWallet('qortal');
    await requestAssetTransfer('qortium', 7, 'Qrecipient', '1.25');
    await requestAssetTransfer('qortal', 9, 'Qrecipient', '2');

    expect(qdnMock).toHaveBeenCalledWith({
      action: 'GET_USER_WALLET',
      assetId: 0,
    });
    expect(qortalMock).toHaveBeenCalledWith({ action: 'GET_USER_ACCOUNT' });
    expect(qdnMock).toHaveBeenCalledWith({
      action: 'TRANSFER_ASSET',
      assetId: 7,
      recipient: 'Qrecipient',
      amount: '1.25',
    });
    expect(qortalMock).toHaveBeenCalledWith({
      action: 'TRANSFER_ASSET',
      assetId: 9,
      recipient: 'Qrecipient',
      amount: '2',
    });
  });

  it('falls back to same-origin Core for public Qortal reads only in a pure Qortal host', async () => {
    const qortalMock = vi
      .fn()
      .mockRejectedValue(new Error('unsupported action'));
    (globalThis as any).qortalRequest = qortalMock;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ assetId: 42, name: 'QORTAL-ASSET' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      requestAssetInfo('qortal', { assetId: 42 })
    ).resolves.toMatchObject({ assetId: 42, name: 'QORTAL-ASSET' });
    expect(fetchMock).toHaveBeenCalledWith('/assets/info?assetId=42');

    (globalThis as any).qdnRequest = vi.fn();
    await expect(requestAssetInfo('qortal', { assetId: 43 })).rejects.toThrow(
      'unsupported action'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads asset balances from Core with a lowercase assetid query param', async () => {
    (globalThis as any).qortalRequest = vi
      .fn()
      .mockRejectedValue(new Error('unsupported action'));
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    await requestAssetRead('qortal', {
      action: 'GET_ASSET_BALANCES',
      assetId: 42,
      address: 'QortalAddress',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/assets/balances?address=QortalAddress&assetid=42'
    );
  });

  it('reads asset transfers from Core with assetId as a path segment', async () => {
    (globalThis as any).qortalRequest = vi
      .fn()
      .mockRejectedValue(new Error('unsupported action'));
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    await requestAssetRead('qortal', {
      action: 'GET_ASSET_TRANSFERS',
      assetId: 42,
      address: 'QortalAddress',
      limit: 20,
      reverse: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/assets/transfers/42?address=QortalAddress&limit=20&reverse=false'
    );
  });

  it('uses Qortal native TRANSFER_ASSET when SHOW_ACTIONS is unavailable', async () => {
    (globalThis as any).qortalRequest = vi
      .fn()
      .mockRejectedValue(new Error('unsupported action'));

    await expect(requestAssetActions('qortal')).resolves.toEqual([
      'TRANSFER_ASSET',
    ]);
  });
});
