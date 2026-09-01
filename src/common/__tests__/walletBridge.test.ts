import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  qortSendActionForActions,
  requestQortActions,
  requestQortBalance,
  requestQortNameData,
  requestQortSend,
  requestQortTransactions,
  requestQortUnlock,
  requestQortWallet,
  requestWalletForCoin,
} from '../walletBridge';

afterEach(() => {
  delete (globalThis as any).qdnRequest;
  delete (globalThis as any).qortalRequest;
});

describe('QORT bridge routing', () => {
  it('prefers qortalRequest for QORT wallet, balance, history, and names', async () => {
    const qdnMock = vi.fn();
    const qortalMock = vi.fn(async (request: QdnRequestOptions) => {
      if (request.action === 'GET_USER_ACCOUNT')
        return { address: 'QortAddress' };
      if (request.action === 'GET_BALANCE') return '12.5';
      if (request.action === 'SEARCH_TRANSACTIONS') return [];
      if (request.action === 'GET_NAME_DATA') return { owner: 'QortAddress' };
      return null;
    });
    (globalThis as any).qdnRequest = qdnMock;
    (globalThis as any).qortalRequest = qortalMock;

    await expect(requestQortWallet()).resolves.toEqual({
      address: 'QortAddress',
    });
    await expect(requestQortBalance()).resolves.toBe('12.5');
    await expect(
      requestQortTransactions('QortAddress', {
        txType: ['PAYMENT'],
        limit: 20,
      })
    ).resolves.toEqual([]);
    await expect(requestQortNameData('Alice')).resolves.toEqual({
      owner: 'QortAddress',
    });

    expect(qortalMock).toHaveBeenCalledWith({
      action: 'GET_USER_ACCOUNT',
    });
    expect(qortalMock).toHaveBeenCalledWith({
      action: 'GET_BALANCE',
      address: 'QortAddress',
    });
    expect(qortalMock).toHaveBeenCalledWith({
      action: 'SEARCH_TRANSACTIONS',
      address: 'QortAddress',
      txType: ['PAYMENT'],
      limit: 20,
    });
    expect(qortalMock).toHaveBeenCalledWith({
      action: 'GET_NAME_DATA',
      name: 'Alice',
    });
    expect(qdnMock).not.toHaveBeenCalled();
  });

  it('uses the explicit Home 1.x QDN compatibility actions only when qortalRequest is absent', async () => {
    const qdnMock = vi.fn(async (request: QdnRequestOptions) => {
      if (request.action === 'GET_USER_WALLET')
        return { address: 'LegacyAddress' };
      if (request.action === 'GET_QORT_BALANCE') return '2';
      if (request.action === 'SEARCH_QORTAL_TRANSACTIONS') return [];
      if (request.action === 'GET_QORTAL_NAME_DATA')
        return { owner: 'LegacyAddress' };
      if (request.action === 'SHOW_ACTIONS') return ['SEND_QORT'];
      if (request.action === 'UNLOCK_SELECTED_ACCOUNT')
        return { isUnlocked: true };
      if (request.action === 'SEND_QORT') return { accepted: true };
      return null;
    });
    (globalThis as any).qdnRequest = qdnMock;

    await requestQortWallet();
    await requestQortBalance();
    await requestQortTransactions('LegacyAddress');
    await requestQortNameData('Alice');
    await expect(requestQortActions()).resolves.toEqual({
      actions: ['SEND_QORT'],
      protocol: 'qdnRequest',
    });
    await requestQortUnlock();
    await requestQortSend('SEND_QORT', 'Recipient', 1.25);

    expect(qdnMock).toHaveBeenCalledWith({
      action: 'GET_USER_WALLET',
      assetId: 0,
    });
    expect(qdnMock).toHaveBeenCalledWith({ action: 'GET_QORT_BALANCE' });
    expect(qdnMock).toHaveBeenCalledWith({
      action: 'SEARCH_QORTAL_TRANSACTIONS',
      address: 'LegacyAddress',
    });
    expect(qdnMock).toHaveBeenCalledWith({
      action: 'GET_QORTAL_NAME_DATA',
      name: 'Alice',
    });
  });

  it('selects the advertised send action before making one QORT send request', async () => {
    const qortalMock = vi.fn(async (request: QdnRequestOptions) => {
      if (request.action === 'SHOW_ACTIONS') return ['SEND_COIN'];
      return { accepted: true };
    });
    (globalThis as any).qortalRequest = qortalMock;

    const { actions } = await requestQortActions();
    const action = qortSendActionForActions(actions);
    expect(action).toBe('SEND_COIN');
    await requestQortSend(action!, 'Recipient', 3);

    expect(qortalMock).toHaveBeenLastCalledWith({
      action: 'SEND_COIN',
      coin: 'QORT',
      destinationAddress: 'Recipient',
      amount: 3,
    });
    expect(qortalMock).toHaveBeenCalledTimes(2);
  });

  it('uses Qortal Core SEND_COIN when SHOW_ACTIONS is not available', async () => {
    const qortalMock = vi.fn(async (request: QdnRequestOptions) => {
      if (request.action === 'SHOW_ACTIONS') {
        throw new Error('Unsupported action');
      }
      return { accepted: true };
    });
    (globalThis as any).qortalRequest = qortalMock;

    await expect(requestQortActions()).resolves.toEqual({
      actions: ['SEND_COIN'],
      protocol: 'qortalRequest',
    });
  });

  it('keeps foreign wallet requests on qdnRequest', async () => {
    const qdnMock = vi.fn(async () => ({ address: 'btc-address' }));
    const qortalMock = vi.fn();
    (globalThis as any).qdnRequest = qdnMock;
    (globalThis as any).qortalRequest = qortalMock;

    await expect(requestWalletForCoin('BTC')).resolves.toEqual({
      address: 'btc-address',
    });
    expect(qdnMock).toHaveBeenCalledWith({
      action: 'GET_USER_WALLET',
      coin: 'BTC',
    });
    expect(qortalMock).not.toHaveBeenCalled();
  });
});
