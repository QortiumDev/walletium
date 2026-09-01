import type { AssetNetwork, AssetSelector } from '../utils/Types';

type AssetReadAction =
  | 'GET_ASSET_INFO'
  | 'GET_ASSET_BALANCES'
  | 'GET_ASSET_TRANSFERS';

type AssetReadOptions = QdnRequestOptions & { action: AssetReadAction };

export function availableAssetNetworks(): AssetNetwork[] {
  const networks: AssetNetwork[] = [];
  if (typeof qdnRequest === 'function') networks.push('qortium');
  if (typeof qortalRequest === 'function') networks.push('qortal');
  return networks;
}

function requestForNetwork(network: AssetNetwork, options: QdnRequestOptions) {
  if (network === 'qortium') {
    if (typeof qdnRequest !== 'function') {
      throw new Error('The Qortium bridge is not available in this host.');
    }
    return qdnRequest(options);
  }
  if (typeof qortalRequest !== 'function') {
    throw new Error('The Qortal bridge is not available in this host.');
  }
  return qortalRequest(options);
}

function qortalReadPath(options: AssetReadOptions): string {
  const params = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (key === 'action' || value === undefined || value === null) return;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      params.set(key, String(value));
    }
  });
  const base =
    options.action === 'GET_ASSET_INFO'
      ? '/assets/info'
      : options.action === 'GET_ASSET_BALANCES'
        ? '/assets/balances'
        : '/assets/transfers';
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

async function directQortalRead(options: AssetReadOptions): Promise<any> {
  const response = await fetch(qortalReadPath(options));
  if (!response.ok) {
    throw new Error(`Qortal asset read failed (${response.status}).`);
  }
  return response.json();
}

export async function requestAssetRead(
  network: AssetNetwork,
  options: AssetReadOptions
): Promise<any> {
  try {
    return await requestForNetwork(network, options);
  } catch (error) {
    // A Q-App running directly in Qortal has same-origin access to public Core
    // reads, but older Qortal hosts do not expose these reads as qortalRequest
    // actions. Never use this fallback inside Qortium Home: its page origin is
    // not the selected Qortal node, and Home must provide the explicit bridge.
    if (
      network === 'qortal' &&
      typeof qdnRequest !== 'function' &&
      typeof fetch === 'function'
    ) {
      return directQortalRead(options);
    }
    throw error;
  }
}

export function requestAssetInfo(
  network: AssetNetwork,
  selector: AssetSelector
): Promise<any> {
  return requestAssetRead(network, { action: 'GET_ASSET_INFO', ...selector });
}

export function requestAssetWallet(network: AssetNetwork): Promise<any> {
  return requestForNetwork(
    network,
    network === 'qortal'
      ? { action: 'GET_USER_ACCOUNT' }
      : { action: 'GET_USER_WALLET', assetId: 0 }
  );
}

export async function requestAssetActions(
  network: AssetNetwork
): Promise<string[]> {
  try {
    const actions = await requestForNetwork(network, {
      action: 'SHOW_ACTIONS',
    });
    return Array.isArray(actions)
      ? actions.filter((action): action is string => typeof action === 'string')
      : [];
  } catch (error) {
    // Qortal's native Q-App runtime supports TRANSFER_ASSET even when its
    // qortalRequest implementation predates SHOW_ACTIONS.
    if (network === 'qortal' && typeof qdnRequest !== 'function') {
      return ['TRANSFER_ASSET'];
    }
    throw error;
  }
}

export function requestAssetUnlock(network: AssetNetwork): Promise<any> {
  return requestForNetwork(network, { action: 'UNLOCK_SELECTED_ACCOUNT' });
}

export function requestAssetTransfer(
  network: AssetNetwork,
  assetId: number,
  recipient: string,
  amount: string
): Promise<any> {
  // Financial requests are deliberately single-shot: no protocol fallback and
  // no retry after an ambiguous response.
  return requestForNetwork(network, {
    action: 'TRANSFER_ASSET',
    assetId,
    recipient,
    amount,
  });
}
