import { describe, expect, it } from 'vitest';
import type { ChainConfig } from '../../config/chains';
import {
  foreignWalletAvailability,
  HOME_WALLET_CONTRACT,
} from '../homeWalletCapabilities';

const chain: ChainConfig = {
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
  homeWallet: {
    contract: HOME_WALLET_CONTRACT,
    implemented: true,
    protocol: 'qdnRequest',
    read: true,
    receive: true,
    requiresUnlockedAccount: true,
    send: true,
    serverManagement: true,
    sendMode: 'TRUSTED_CORE',
  },
};

describe('foreign wallet capability contract', () => {
  it('does not infer foreign sending from generic actions alone', () => {
    const withoutCapability = foreignWalletAvailability(
      { ...chain, homeWallet: undefined },
      ['SEND_COIN', 'GET_WALLET_BALANCE']
    );
    expect(withoutCapability.canSend).toBe(false);

    const unversioned = foreignWalletAvailability(
      {
        ...chain,
        homeWallet: { ...chain.homeWallet!, contract: undefined },
      },
      ['SEND_COIN', 'GET_WALLET_BALANCE']
    );
    expect(unversioned.canSend).toBe(false);
  });

  it('gates each operation independently', () => {
    const partial = foreignWalletAvailability(
      {
        ...chain,
        homeWallet: {
          ...chain.homeWallet!,
          requiresUnlockedAccount: false,
        },
      },
      ['SEND_COIN']
    );
    expect(partial).toEqual({
      canManageServer: false,
      canReadBalance: false,
      canReadTransactions: false,
      canReceive: false,
      canSend: true,
    });

    const complete = foreignWalletAvailability(chain, [
      'GET_USER_WALLET',
      'GET_WALLET_BALANCE',
      'GET_USER_WALLET_TRANSACTIONS',
      'SEND_COIN',
      'UNLOCK_SELECTED_ACCOUNT',
      'GET_CROSSCHAIN_SERVER_INFO',
      'SET_CURRENT_FOREIGN_SERVER',
    ]);
    expect(complete).toEqual({
      canManageServer: true,
      canReadBalance: true,
      canReadTransactions: true,
      canReceive: true,
      canSend: true,
    });
  });

  it('honors explicit per-chain send refusal', () => {
    const availability = foreignWalletAvailability(
      {
        ...chain,
        homeWallet: { ...chain.homeWallet!, send: false },
      },
      ['SEND_COIN', 'GET_WALLET_BALANCE']
    );
    expect(availability.canReadBalance).toBe(true);
    expect(availability.canSend).toBe(false);
  });

  it('requires the advertised unlock action only when the chain contract does', () => {
    expect(foreignWalletAvailability(chain, ['SEND_COIN']).canSend).toBe(false);
    expect(
      foreignWalletAvailability(chain, ['SEND_COIN', 'UNLOCK_SELECTED_ACCOUNT'])
        .canSend
    ).toBe(true);
    expect(
      foreignWalletAvailability(
        {
          ...chain,
          homeWallet: {
            ...chain.homeWallet!,
            requiresUnlockedAccount: false,
          },
        },
        ['SEND_COIN']
      ).canSend
    ).toBe(true);
  });

  it('requires both server read and update actions', () => {
    expect(
      foreignWalletAvailability(chain, ['SET_CURRENT_FOREIGN_SERVER'])
        .canManageServer
    ).toBe(false);
    expect(
      foreignWalletAvailability(chain, [
        'GET_CROSSCHAIN_SERVER_INFO',
        'SET_CURRENT_FOREIGN_SERVER',
      ]).canManageServer
    ).toBe(true);
  });
});
