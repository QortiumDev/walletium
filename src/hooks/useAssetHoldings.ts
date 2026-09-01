import { useCallback, useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
  pinnedAssetIdsAtom,
  pinnedQortalAssetIdsAtom,
  walletReadyAtom,
} from '../state/global/system';
import { TIME_MINUTES_3 } from '../common/constants';
import {
  availableAssetNetworks,
  requestAssetInfo,
  requestAssetRead,
  requestAssetWallet,
} from '../common/assetBridge';
import type {
  AssetBalanceData,
  AssetData,
  AssetHolding,
  AssetNetwork,
  AssetSelector,
  NetworkAssetSelector,
} from '../utils/Types';

export type PinAssetResult = { ok: true } | { ok: false; error: string };

interface UseAssetHoldingsResult {
  assets: AssetHolding[];
  loading: boolean;
  networks: AssetNetwork[];
  refresh: () => void;
  pinAsset: (selector: NetworkAssetSelector) => Promise<PinAssetResult>;
  unpinAsset: (network: AssetNetwork, assetId: number) => void;
}

async function fetchAssetInfo(
  network: AssetNetwork,
  selector: AssetSelector
): Promise<AssetData | null> {
  try {
    const res = await requestAssetInfo(network, selector);
    return (res ?? null) as AssetData | null;
  } catch {
    return null;
  }
}

function toHolding(
  network: AssetNetwork,
  info: AssetData,
  balance: string,
  pinned: boolean
): AssetHolding {
  return {
    network,
    assetId: info.assetId,
    name: info.name,
    description: info.description,
    owner: info.owner,
    quantity: info.quantity,
    isDivisible: info.isDivisible,
    data: info.data,
    isOwnerForSale: info.isOwnerForSale,
    ownerSalePrice: info.ownerSalePrice,
    balance,
    pinned,
  };
}

async function loadNetworkAssets(
  network: AssetNetwork,
  pinnedIds: number[]
): Promise<AssetHolding[]> {
  const wallet = await requestAssetWallet(network);
  const address: string | undefined = wallet?.address;
  if (!address) return [];

  const heldRaw = await requestAssetRead(network, {
    action: 'GET_ASSET_BALANCES',
    address,
    excludeZero: true,
    limit: 0,
  });
  // Asset 0 is the native coin and already has its own QORT/Qortium row.
  const held: AssetBalanceData[] = Array.isArray(heldRaw)
    ? heldRaw.filter((balance) => balance.assetId !== 0)
    : [];
  const heldIds = new Set(held.map((balance) => balance.assetId));
  const missingPinned = pinnedIds.filter(
    (assetId) => assetId !== 0 && !heldIds.has(assetId)
  );

  const [heldInfo, pinnedInfo] = await Promise.all([
    Promise.all(
      held.map((balance) =>
        fetchAssetInfo(network, { assetId: balance.assetId })
      )
    ),
    Promise.all(
      missingPinned.map((assetId) => fetchAssetInfo(network, { assetId }))
    ),
  ]);

  const holdings: AssetHolding[] = [];
  held.forEach((balance, index) => {
    const info = heldInfo[index];
    if (info) {
      holdings.push(
        toHolding(
          network,
          info,
          balance.balance,
          pinnedIds.includes(balance.assetId)
        )
      );
    }
  });
  missingPinned.forEach((_assetId, index) => {
    const info = pinnedInfo[index];
    if (info) holdings.push(toHolding(network, info, '0', true));
  });
  return holdings;
}

// Discovers held assets independently on every bridge exposed by the host.
// A failed chain does not hide assets successfully loaded from the other chain.
export function useAssetHoldings(): UseAssetHoldingsResult {
  const walletReady = useAtomValue(walletReadyAtom);
  const [pinnedIds, setPinnedIds] = useAtom(pinnedAssetIdsAtom);
  const [pinnedQortalIds, setPinnedQortalIds] = useAtom(
    pinnedQortalAssetIdsAtom
  );
  const [assets, setAssets] = useState<AssetHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const networks = availableAssetNetworks();

  const refresh = useCallback(() => setRefreshTick((tick) => tick + 1), []);

  useEffect(() => {
    if (!walletReady) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const results = await Promise.allSettled(
        networks.map((network) =>
          loadNetworkAssets(
            network,
            network === 'qortal' ? pinnedQortalIds : pinnedIds
          )
        )
      );
      if (!cancelled) {
        setAssets(
          results.flatMap((result) =>
            result.status === 'fulfilled' ? result.value : []
          )
        );
        setLoading(false);
      }
    }

    void load();
    const id = setInterval(load, TIME_MINUTES_3);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // Bridge globals are fixed for the lifetime of a Q-App page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletReady, pinnedIds, pinnedQortalIds, refreshTick]);

  const pinAsset = useCallback(
    async (selector: NetworkAssetSelector): Promise<PinAssetResult> => {
      const { network, ...assetSelector } = selector;
      const info = await fetchAssetInfo(network, assetSelector);
      if (!info || info.assetId === 0) {
        return { ok: false, error: 'Asset not found' };
      }
      const ids = network === 'qortal' ? pinnedQortalIds : pinnedIds;
      if (ids.includes(info.assetId)) return { ok: true };
      const setter = network === 'qortal' ? setPinnedQortalIds : setPinnedIds;
      setter((previous) => [...previous, info.assetId]);
      return { ok: true };
    },
    [pinnedIds, pinnedQortalIds, setPinnedIds, setPinnedQortalIds]
  );

  const unpinAsset = useCallback(
    (network: AssetNetwork, assetId: number) => {
      const setter = network === 'qortal' ? setPinnedQortalIds : setPinnedIds;
      setter((previous) => previous.filter((id) => id !== assetId));
    },
    [setPinnedIds, setPinnedQortalIds]
  );

  return { assets, loading, networks, refresh, pinAsset, unpinAsset };
}
