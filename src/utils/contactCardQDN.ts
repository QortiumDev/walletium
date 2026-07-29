import { objectToBase64 } from 'qapp-core';
import type { ContactCardLocalState, ContactCardQDNData } from './Types';

const IDENTIFIER = 'walletium-contactcard';
const SERVICE = 'DOCUMENT';

export type ContactCardFetchResult =
  | { status: 'found'; data: ContactCardQDNData }
  | { status: 'not-found' }
  | { status: 'fetch-failed'; error?: unknown };

function isResourceNotFound(error: any): boolean {
  return (
    error?.message?.includes('404') ||
    error?.status === 404 ||
    error?.error === 1401 ||
    error?.message?.includes("Couldn't find PUT transaction")
  );
}

export async function fetchContactCard(
  name: string
): Promise<ContactCardFetchResult> {
  let raw: unknown;
  try {
    raw = await qdnRequest({
      action: 'FETCH_QDN_RESOURCE',
      identifier: IDENTIFIER,
      service: SERVICE,
      name,
      encoding: 'base64',
    });
  } catch (err) {
    if (isResourceNotFound(err)) return { status: 'not-found' };
    return { status: 'fetch-failed', error: err };
  }

  if (!raw) return { status: 'not-found' };

  const data = raw as ContactCardQDNData;
  if (!data || typeof data.addresses !== 'object' || data.addresses === null) {
    return {
      status: 'fetch-failed',
      error: new Error('Malformed contact card resource'),
    };
  }

  return { status: 'found', data };
}

async function ensureAccountUnlocked(): Promise<boolean> {
  const result = (await qdnRequest({
    action: 'UNLOCK_SELECTED_ACCOUNT',
  })) as { isUnlocked?: boolean } | null;
  return result?.isUnlocked === true;
}

async function resolveAddressForCoin(
  coin: string,
  overrideAddress: string | undefined
): Promise<string | null> {
  if (overrideAddress) return overrideAddress;
  try {
    const res = (await qdnRequest(
      coin === 'QORT'
        ? { action: 'GET_USER_WALLET', assetId: 0 }
        : { action: 'GET_USER_WALLET', coin }
    )) as { address?: string } | null;
    return res?.address ?? null;
  } catch {
    return null;
  }
}

export async function publishContactCard(
  localState: ContactCardLocalState,
  userName: string
): Promise<{ publishedAt: number } | null> {
  try {
    if (!(await ensureAccountUnlocked())) return null;

    const publishedCoins = Object.entries(localState).filter(
      ([, state]) => state.decision === 'published'
    );

    const resolved = await Promise.all(
      publishedCoins.map(async ([coin, state]) => {
        const address = await resolveAddressForCoin(
          coin,
          state.overrideAddress
        );
        return address ? ([coin, address] as const) : null;
      })
    );

    const addresses: Record<string, string> = {};
    for (const entry of resolved) {
      if (entry) addresses[entry[0]] = entry[1];
    }

    const lastUpdated = Date.now();
    const data: ContactCardQDNData = {
      version: 1,
      lastUpdated,
      addresses,
    };

    try {
      await qdnRequest({
        action: 'DELETE_QDN_RESOURCE',
        service: SERVICE,
        name: userName,
        identifier: IDENTIFIER,
      });
    } catch {
      // Nothing to delete on the first-ever publish - proceed regardless.
    }

    const base64 = await objectToBase64(data);

    await qdnRequest({
      action: 'PUBLISH_QDN_RESOURCE',
      service: SERVICE,
      name: userName,
      identifier: IDENTIFIER,
      base64,
    });

    return { publishedAt: lastUpdated };
  } catch (error) {
    console.error('Contact Card: Error publishing', error);
    return null;
  }
}

