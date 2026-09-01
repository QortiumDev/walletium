import { fetchContactCard } from './contactCardQDN';
import { requestQortNameData } from '../common/walletBridge';

export type ContactResolution =
  | { status: 'resolved'; address: string; coin: string; name: string }
  | { status: 'coin-not-published'; name: string; coin: string }
  | { status: 'no-card'; name: string }
  | { status: 'name-not-found'; name: string }
  | { status: 'fetch-failed'; name: string };

export async function resolveContact(
  name: string,
  coin: string,
  network: 'qortium' | 'qortal' = 'qortium'
): Promise<ContactResolution> {
  const trimmedName = name.trim();

  if (coin === 'QORT' && network === 'qortal') {
    const nameData = (await requestQortNameData(trimmedName).catch(
      () => null
    )) as { owner?: string } | null;
    return nameData?.owner
      ? {
          status: 'resolved',
          address: nameData.owner,
          coin,
          name: trimmedName,
        }
      : { status: 'name-not-found', name: trimmedName };
  }

  const [nameData, cardResult] = await Promise.all([
    qdnRequest({ action: 'GET_NAME_DATA', name: trimmedName }).catch(
      () => null
    ),
    fetchContactCard(trimmedName),
  ]);

  if (!(nameData as { owner?: string } | null)?.owner) {
    return { status: 'name-not-found', name: trimmedName };
  }
  if (cardResult.status === 'fetch-failed') {
    return { status: 'fetch-failed', name: trimmedName };
  }
  if (cardResult.status === 'not-found') {
    return { status: 'no-card', name: trimmedName };
  }

  const address = cardResult.data.addresses[coin];
  if (!address) {
    return { status: 'coin-not-published', name: trimmedName, coin };
  }

  return { status: 'resolved', address, coin, name: trimmedName };
}
