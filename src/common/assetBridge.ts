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

function buildQueryParams(options: object, omit: Set<string>): string {
  const params = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (omit.has(key) || value === undefined || value === null) return;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

// Core's REST API is inconsistent about assetId: /assets/info takes it as a
// camelCase query param, /assets/balances takes it as a lowercase "assetid"
// query param, and /assets/transfers takes it as a required path segment.
function qortalReadPath(options: AssetReadOptions): string {
  const assetId = (options as { assetId?: unknown }).assetId;
  const hasAssetId = typeof assetId === 'number';

  if (options.action === 'GET_ASSET_TRANSFERS') {
    if (!hasAssetId) {
      throw new Error('GET_ASSET_TRANSFERS requires a numeric assetId.');
    }
    const query = buildQueryParams(options, new Set(['action', 'assetId']));
    return `/assets/transfers/${assetId}${query ? `?${query}` : ''}`;
  }

  if (options.action === 'GET_ASSET_BALANCES') {
    const query = buildQueryParams(options, new Set(['action', 'assetId']));
    const params = new URLSearchParams(query);
    if (hasAssetId) params.set('assetid', String(assetId));
    const finalQuery = params.toString();
    return `/assets/balances${finalQuery ? `?${finalQuery}` : ''}`;
  }

  const query = buildQueryParams(options, new Set(['action']));
  return `/assets/info${query ? `?${query}` : ''}`;
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
