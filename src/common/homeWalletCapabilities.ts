import type { ChainConfig } from '../config/chains';

export const HOME_WALLET_CONTRACT = 'qortium-home-wallet-v1';

export interface ForeignWalletAvailability {
  canManageServer: boolean;
  canReadBalance: boolean;
  canReadTransactions: boolean;
  canReceive: boolean;
  canSend: boolean;
}

const unavailable: ForeignWalletAvailability = Object.freeze({
  canManageServer: false,
  canReadBalance: false,
  canReadTransactions: false,
  canReceive: false,
  canSend: false,
});

export function foreignWalletAvailability(
  chain: Pick<ChainConfig, 'homeWallet' | 'isNative'>,
  advertisedActions: readonly string[]
): ForeignWalletAvailability {
  const capability = chain.homeWallet;
  if (
    chain.isNative ||
    capability?.contract !== HOME_WALLET_CONTRACT ||
    capability.implemented !== true ||
    capability.protocol !== 'qdnRequest' ||
    typeof capability.requiresUnlockedAccount !== 'boolean'
  ) {
    return unavailable;
  }

  const actions = new Set(advertisedActions);
  const canReadBalance =
    capability.read === true && actions.has('GET_WALLET_BALANCE');
  const canReadTransactions =
    capability.read === true && actions.has('GET_USER_WALLET_TRANSACTIONS');
  const canReceive =
    capability.receive === true && actions.has('GET_USER_WALLET');
  const canManageServer =
    capability.serverManagement === true &&
    actions.has('GET_CROSSCHAIN_SERVER_INFO') &&
    actions.has('SET_CURRENT_FOREIGN_SERVER');
  const canSend =
    capability.send === true &&
    actions.has('SEND_COIN') &&
    (!capability.requiresUnlockedAccount ||
      actions.has('UNLOCK_SELECTED_ACCOUNT'));

  return Object.freeze({
    canManageServer,
    canReadBalance,
    canReadTransactions,
    canReceive,
    canSend,
  });
}
