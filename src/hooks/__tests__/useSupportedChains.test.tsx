import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSupportedChains } from '../useSupportedChains';
import { HOME_WALLET_CONTRACT } from '../../common/homeWalletCapabilities';

describe('useSupportedChains bridge availability', () => {
  beforeEach(() => {
    sessionStorage.clear();
    delete (globalThis as any).qdnRequest;
  });

  afterEach(() => {
    sessionStorage.clear();
    delete (globalThis as any).qdnRequest;
    vi.restoreAllMocks();
  });

  it('shows only QORT when hosted without qdnRequest', async () => {
    const { result } = renderHook(() => useSupportedChains());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.chains.map((chain) => chain.key)).toEqual(['QORT']);
  });

  it('preserves versioned Home capabilities and refreshes them on bridge changes', async () => {
    let send = true;
    const request = vi.fn(async () => [
      {
        currencyCode: 'BTC',
        walletEnabled: true,
        decimalPlaces: 8,
        activeNetwork: 'MAIN',
        supportsHtlc: true,
        supportsLocalChainTrades: true,
        homeWallet: {
          contract: HOME_WALLET_CONTRACT,
          implemented: true,
          protocol: 'qdnRequest',
          read: true,
          receive: true,
          requiresUnlockedAccount: true,
          send,
          serverManagement: true,
          sendMode: 'TRUSTED_CORE',
        },
      },
    ]);
    (globalThis as any).qdnRequest = request;

    const { result } = renderHook(() => useSupportedChains());
    await waitFor(() => expect(result.current.status).toBe('live'));
    expect(result.current.chains[1].homeWallet?.send).toBe(true);
    expect(sessionStorage.getItem('qortium_supported_chains_v2')).toContain(
      HOME_WALLET_CONTRACT
    );

    send = false;
    window.dispatchEvent(new Event('qortiumBridgeStateChanged'));
    await waitFor(() =>
      expect(result.current.chains[1].homeWallet?.send).toBe(false)
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not trust a cached wallet capability before live discovery', async () => {
    sessionStorage.setItem(
      'qortium_supported_chains_v2',
      JSON.stringify([
        {
          ...{
            key: 'BTC',
            decimalPlaces: 8,
            activeNetwork: 'MAIN',
            supportsHtlc: true,
            supportsLocalChainTrades: true,
          },
          homeWallet: {
            contract: HOME_WALLET_CONTRACT,
            implemented: true,
            protocol: 'qdnRequest',
            read: true,
            receive: true,
            requiresUnlockedAccount: true,
            send: true,
            sendMode: 'TRUSTED_CORE',
          },
        },
      ])
    );
    let resolveDiscovery!: (value: unknown) => void;
    (globalThis as any).qdnRequest = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveDiscovery = resolve;
        })
    );

    const { result } = renderHook(() => useSupportedChains());
    expect(result.current.status).toBe('pending');
    expect(result.current.chains[1].homeWallet).toBeUndefined();

    resolveDiscovery([]);
    await waitFor(() => expect(result.current.status).toBe('live'));
  });

  it('ignores an older discovery response after a bridge refresh', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    (globalThis as any).qdnRequest = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const { result } = renderHook(() => useSupportedChains());
    await waitFor(() => expect(resolvers).toHaveLength(1));
    window.dispatchEvent(new Event('qortiumBridgeStateChanged'));
    await waitFor(() => expect(resolvers).toHaveLength(2));

    resolvers[1]([]);
    await waitFor(() => expect(result.current.status).toBe('live'));
    resolvers[0]([
      {
        currencyCode: 'BTC',
        walletEnabled: true,
        decimalPlaces: 8,
        activeNetwork: 'MAIN',
        supportsHtlc: true,
        supportsLocalChainTrades: true,
        homeWallet: {
          contract: HOME_WALLET_CONTRACT,
          implemented: true,
          protocol: 'qdnRequest',
          read: true,
          receive: true,
          requiresUnlockedAccount: true,
          send: true,
          sendMode: 'TRUSTED_CORE',
        },
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.chains.map((chain) => chain.key)).toEqual(['QORT']);
  });
});
