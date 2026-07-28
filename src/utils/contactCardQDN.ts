import type { ContactCardQDNData } from './Types';

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
