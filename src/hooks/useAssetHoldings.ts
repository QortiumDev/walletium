import { useCallback, useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { pinnedAssetIdsAtom, walletReadyAtom } from '../state/global/system';
import { TIME_MINUTES_3 } from '../common/constants';
import type { AssetBalanceData, AssetData, AssetHolding, AssetSelector } from '../utils/Types';

export type PinAssetResult = { ok: true } | { ok: false; error: string };

interface UseAssetHoldingsResult {
  assets: AssetHolding[];
  loading: boolean;
  refresh: () => void;
  pinAsset: (selector: AssetSelector) => Promise<PinAssetResult>;
  unpinAsset: (assetId: number) => void;
}

async function fetchAssetInfo(selector: AssetSelector): Promise<AssetData | null> {
  try {
    const res = await qdnRequest({
      action: 'GET_ASSET_INFO',
      ...selector,
    });
    return (res ?? null) as AssetData | null;
  } catch {
    return null;
  }
}

function toHolding(
  info: AssetData,
  balance: string,
  pinned: boolean
): AssetHolding {
  return {
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

// Discovers held assets (balance > 0) for the selected account in a single
// call, then tops up any pinned assets the account doesn't currently hold
// with a zero balance so they still render (e.g. before first receipt).
export function useAssetHoldings(): UseAssetHoldingsResult {
  const walletReady = useAtomValue(walletReadyAtom);
  const [pinnedIds, setPinnedIds] = useAtom(pinnedAssetIdsAtom);
  const [assets, setAssets] = useState<AssetHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (!walletReady) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const wallet = await qdnRequest({
          action: 'GET_USER_WALLET',
          assetId: 0,
        });
        const address: string | undefined = wallet?.address;
        if (!address) {
          if (!cancelled) setAssets([]);
          return;
        }

        const heldRaw = await qdnRequest({
          action: 'GET_ASSET_BALANCES',
          address,
          excludeZero: true,
          limit: 0,
        });
        const held: AssetBalanceData[] = Array.isArray(heldRaw) ? heldRaw : [];
        const heldIds = new Set(held.map((b) => b.assetId));
        const missingPinned = pinnedIds.filter((id) => !heldIds.has(id));

        const [heldInfo, pinnedInfo] = await Promise.all([
          Promise.all(held.map((b) => fetchAssetInfo({ assetId: b.assetId }))),
          Promise.all(missingPinned.map((id) => fetchAssetInfo({ assetId: id }))),
        ]);

        const holdings: AssetHolding[] = [];
        held.forEach((b, i) => {
          const info = heldInfo[i];
          if (info) holdings.push(toHolding(info, b.balance, pinnedIds.includes(b.assetId)));
        });
        missingPinned.forEach((_id, i) => {
          const info = pinnedInfo[i];
          if (info) holdings.push(toHolding(info, '0', true));
        });

        if (!cancelled) setAssets(holdings);
      } catch {
        if (!cancelled) setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, TIME_MINUTES_3);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletReady, pinnedIds, refreshTick]);

  const pinAsset = useCallback(
    async (selector: AssetSelector): Promise<PinAssetResult> => {
      const info = await fetchAssetInfo(selector);
      if (!info) return { ok: false, error: 'Asset not found' };
      if (pinnedIds.includes(info.assetId)) return { ok: true };
      setPinnedIds((prev) => [...prev, info.assetId]);
      return { ok: true };
    },
    [pinnedIds, setPinnedIds]
  );

  const unpinAsset = useCallback(
    (assetId: number) => {
      setPinnedIds((prev) => prev.filter((id) => id !== assetId));
    },
    [setPinnedIds]
  );

  return { assets, loading, refresh, pinAsset, unpinAsset };
}
