# Contact Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the (currently unwired) private per-coin Address Book with public, self-published "contact cards" so sending to someone becomes "type their Qortium name, pick a coin" instead of maintaining a private book of pasted-in addresses.

**Architecture:** One public `DOCUMENT` QDN resource per user (`walletium-contactcard`) holds a `coin -> address` map, built from the wallet's own managed addresses with a per-coin publish/private toggle. A single `resolveContact(name, coin)` function - always a fresh fetch, never cached - backs both a dedicated "Find a Person" page and a Name/Address toggle inside every coin's existing send flow. Every card edit does delete-then-republish so a stale copy can never be served.

**Tech Stack:** React 19 + TypeScript, MUI 7, jotai, react-i18next, react-router-dom v7 (hash router), Vitest + Testing Library, the `qdnRequest` bridge global (Qortium Home).

---

## Reference: spec

Full design: `docs/superpowers/specs/2026-07-28-contact-cards-design.md`

## File Structure

**Create:**
- `src/utils/contactCardStorage.ts` - local per-coin decision state (published/private/undecided + optional override address), localStorage-backed
- `src/utils/__tests__/contactCardStorage.test.ts`
- `src/utils/contactCardQDN.ts` - fetch/publish (delete-then-republish)/debounce against the public QDN resource
- `src/utils/__tests__/contactCardQDN.test.ts`
- `src/utils/resolveContact.ts` - the shared resolver (`resolveContact`) and `missingCoinsForCard`
- `src/utils/__tests__/resolveContact.test.ts`
- `src/utils/contactMru.ts` - tiny "recently searched names" list (names only, never addresses)
- `src/utils/__tests__/contactMru.test.ts`
- `src/components/ContactCard/ContactCardCoinRow.tsx` - one coin's row in "My Contact Card" (address, publish/private switch, override)
- `src/components/ContactCard/__tests__/ContactCardCoinRow.test.tsx`
- `src/components/ContactCard/ContactCardCompletenessBanner.tsx` - "N coins not on your card yet"
- `src/components/ContactCard/__tests__/ContactCardCompletenessBanner.test.tsx`
- `src/components/ContactCard/MyContactCardPage.tsx` - the owner's card management page
- `src/components/ContactCard/__tests__/MyContactCardPage.test.tsx`
- `src/components/ContactCard/FindPersonPage.tsx` - search-a-person-first entry path
- `src/components/ContactCard/__tests__/FindPersonPage.test.tsx`

**Modify:**
- `src/utils/Types.tsx` - remove `AddressBookEntry`, add `ContactCardQDNData`, `ContactCardCoinState`, `ContactCardLocalState`
- `src/components/wallet/CoinDetail.tsx` - Name/Address recipient tabs, resolver wiring, pre-send re-resolution
- `src/components/wallet/__tests__/CoinDetail.send.test.tsx` - new tests for the above
- `src/routes/Routes.tsx` - add `/contacts` and `/contacts/find`
- `src/components/layout/TopBar.tsx` - nav icon into `/contacts`
- `src/AppLayout.tsx` - drop the old `syncAllAddressBooksOnStartup` call
- `src/common/constants.ts` - remove `ADDRESSBOOK_*`
- `src/i18n/locales/en/core.json` - remove `address_book_*`, add `contact_card_*` and new `send_dialog.*` keys

**Delete:**
- `src/components/AddressBook/` (entire folder, including its `__tests__`)
- `src/utils/addressBookStorage.ts`, `src/utils/__tests__/addressBookStorage.test.ts`
- `src/utils/addressBookQDN.ts`, `src/utils/__tests__/addressBookQDN.test.ts`

Note on i18n scope: `fallbackLng: 'en'` is configured in `src/i18n/i18n.ts`, so new keys only need to exist in `en/core.json` - every other locale automatically falls back to the English string for keys it doesn't have. This plan only adds English copy; translating the other 17 locale files is a separate follow-up, not part of this feature.

---

### Task 1: Types

**Files:**
- Modify: `src/utils/Types.tsx`

- [ ] **Step 1: Replace `AddressBookEntry` with the contact-card types**

In `src/utils/Types.tsx`, remove the `AddressBookEntry` interface (lines 63-72) and the now-unused `Coin` import if nothing else in the file uses it, and add:

```ts
export interface ContactCardQDNData {
  version: 1;
  lastUpdated: number; // Unix timestamp
  addresses: Record<string, string>; // coin key (e.g. "BTC") -> address
}

export type ContactCardDecision = 'published' | 'private' | 'undecided';

export interface ContactCardCoinState {
  decision: ContactCardDecision;
  overrideAddress?: string;
}

export type ContactCardLocalState = Record<string, ContactCardCoinState>;
```

Check whether `Coin` is still used elsewhere in `Types.tsx` (it was only used by `AddressBookEntry.coinType`) before removing the import - if nothing else references it, delete the `import { Coin } from 'qapp-core';` line too.

- [ ] **Step 2: Verify the project still typechecks**

Run: `npx tsc -b --noEmit`
Expected: fails only on files that still import `AddressBookEntry` (that's expected - they get removed/updated in later tasks). If it fails on anything else, stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add src/utils/Types.tsx
git commit -m "Replace AddressBookEntry types with contact card types"
```

---

### Task 2: `contactCardStorage.ts` - local decision state

**Files:**
- Create: `src/utils/contactCardStorage.ts`
- Test: `src/utils/__tests__/contactCardStorage.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/utils/__tests__/contactCardStorage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getContactCardLocalState,
  getCoinState,
  setCoinDecision,
  setCoinOverrideAddress,
} from '../contactCardStorage';

describe('contactCardStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty object when nothing has been saved yet', () => {
    expect(getContactCardLocalState()).toEqual({});
  });

  it('returns "undecided" for a coin with no saved state', () => {
    expect(getCoinState('BTC')).toEqual({ decision: 'undecided' });
  });

  it('setCoinDecision persists the decision and returns the updated state', () => {
    const next = setCoinDecision('BTC', 'published');
    expect(next.BTC).toEqual({ decision: 'published' });
    expect(getCoinState('BTC')).toEqual({ decision: 'published' });
  });

  it('setCoinDecision does not disturb other coins already saved', () => {
    setCoinDecision('BTC', 'published');
    setCoinDecision('LTC', 'private');
    expect(getCoinState('BTC')).toEqual({ decision: 'published' });
    expect(getCoinState('LTC')).toEqual({ decision: 'private' });
  });

  it('setCoinOverrideAddress sets an override without changing the decision', () => {
    setCoinDecision('BTC', 'published');
    setCoinOverrideAddress('BTC', 'bc1qcoldstorageaddress');
    expect(getCoinState('BTC')).toEqual({
      decision: 'published',
      overrideAddress: 'bc1qcoldstorageaddress',
    });
  });

  it('setCoinOverrideAddress(coin, undefined) clears a previously set override', () => {
    setCoinDecision('BTC', 'published');
    setCoinOverrideAddress('BTC', 'bc1qcoldstorageaddress');
    setCoinOverrideAddress('BTC', undefined);
    expect(getCoinState('BTC')).toEqual({ decision: 'published' });
  });

  it('survives malformed JSON in localStorage by returning an empty state', () => {
    localStorage.setItem('walletium-contactcard-local', 'not json');
    expect(getContactCardLocalState()).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/contactCardStorage.test.ts`
Expected: FAIL - `Cannot find module '../contactCardStorage'`

- [ ] **Step 3: Implement `contactCardStorage.ts`**

```ts
// src/utils/contactCardStorage.ts
import type {
  ContactCardCoinState,
  ContactCardDecision,
  ContactCardLocalState,
} from './Types';

const STORAGE_KEY = 'walletium-contactcard-local';

export function getContactCardLocalState(): ContactCardLocalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getCoinState(coin: string): ContactCardCoinState {
  return getContactCardLocalState()[coin] ?? { decision: 'undecided' };
}

function save(next: ContactCardLocalState): ContactCardLocalState {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function setCoinDecision(
  coin: string,
  decision: ContactCardDecision
): ContactCardLocalState {
  const state = getContactCardLocalState();
  const current = state[coin] ?? { decision: 'undecided' as ContactCardDecision };
  return save({ ...state, [coin]: { ...current, decision } });
}

export function setCoinOverrideAddress(
  coin: string,
  overrideAddress: string | undefined
): ContactCardLocalState {
  const state = getContactCardLocalState();
  const current = state[coin] ?? { decision: 'undecided' as ContactCardDecision };
  const nextEntry: ContactCardCoinState = overrideAddress
    ? { decision: current.decision, overrideAddress }
    : { decision: current.decision };
  return save({ ...state, [coin]: nextEntry });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/contactCardStorage.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/contactCardStorage.ts src/utils/__tests__/contactCardStorage.test.ts
git commit -m "Add local contact card decision state (published/private/undecided)"
```

---

### Task 3: `contactCardQDN.ts` - `fetchContactCard`

**Files:**
- Create: `src/utils/contactCardQDN.ts`
- Test: `src/utils/__tests__/contactCardQDN.test.ts`

This task covers only the read path. Publish (Task 4) is added to the same file afterward.

- [ ] **Step 1: Write the failing tests**

```ts
// src/utils/__tests__/contactCardQDN.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchContactCard } from '../contactCardQDN';
import type { ContactCardQDNData } from '../Types';

describe('fetchContactCard', () => {
  let mockQdnRequest: ReturnType<typeof vi.fn>;

  afterEach(() => {
    delete (global as any).qdnRequest;
  });

  it('returns "found" with the parsed data when the resource exists', async () => {
    const data: ContactCardQDNData = {
      version: 1,
      lastUpdated: 1000,
      addresses: { BTC: 'bc1qalice' },
    };
    mockQdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      if (req.action === 'FETCH_QDN_RESOURCE') return data;
      throw new Error(`unexpected action ${req.action}`);
    });
    (global as any).qdnRequest = mockQdnRequest;

    const result = await fetchContactCard('Alice');

    expect(result).toEqual({ status: 'found', data });
    expect(mockQdnRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FETCH_QDN_RESOURCE',
        service: 'DOCUMENT',
        identifier: 'walletium-contactcard',
        name: 'Alice',
      })
    );
  });

  it('returns "not-found" on a 404-style error', async () => {
    mockQdnRequest = vi.fn(async () => {
      throw { error: 1401, message: '404 Not Found' };
    });
    (global as any).qdnRequest = mockQdnRequest;

    expect(await fetchContactCard('NoCardHere')).toEqual({ status: 'not-found' });
  });

  it('returns "not-found" when the bridge resolves with no data', async () => {
    mockQdnRequest = vi.fn(async () => null);
    (global as any).qdnRequest = mockQdnRequest;

    expect(await fetchContactCard('Empty')).toEqual({ status: 'not-found' });
  });

  it('returns "fetch-failed" on a genuine, non-404 error', async () => {
    mockQdnRequest = vi.fn(async () => {
      throw new Error('node unreachable');
    });
    (global as any).qdnRequest = mockQdnRequest;

    const result = await fetchContactCard('Alice');
    expect(result.status).toBe('fetch-failed');
  });

  it('returns "fetch-failed" when the resource exists but is malformed (no addresses map)', async () => {
    mockQdnRequest = vi.fn(async () => ({ version: 1, lastUpdated: 1000 }));
    (global as any).qdnRequest = mockQdnRequest;

    const result = await fetchContactCard('Alice');
    expect(result.status).toBe('fetch-failed');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/contactCardQDN.test.ts`
Expected: FAIL - `Cannot find module '../contactCardQDN'`

- [ ] **Step 3: Implement the read path**

```ts
// src/utils/contactCardQDN.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/contactCardQDN.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/contactCardQDN.ts src/utils/__tests__/contactCardQDN.test.ts
git commit -m "Add fetchContactCard read path"
```

---

### Task 4: `contactCardQDN.ts` - delete-then-republish + debounce

**Files:**
- Modify: `src/utils/contactCardQDN.ts`
- Test: `src/utils/__tests__/contactCardQDN.test.ts`

- [ ] **Step 1: Write the failing tests (append to the same test file)**

```ts
// append to src/utils/__tests__/contactCardQDN.test.ts
import {
  debouncedPublishContactCard,
  publishContactCard,
} from '../contactCardQDN';
import type { ContactCardLocalState } from '../Types';

describe('publishContactCard', () => {
  let calls: Array<Record<string, unknown>>;
  let mockQdnRequest: ReturnType<typeof vi.fn>;

  const LOCAL_STATE: ContactCardLocalState = {
    BTC: { decision: 'published' },
    LTC: { decision: 'private' },
    DOGE: { decision: 'published', overrideAddress: 'D-cold-storage' },
  };

  beforeEach(() => {
    calls = [];
    mockQdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      calls.push(req);
      switch (req.action) {
        case 'UNLOCK_SELECTED_ACCOUNT':
          return { isUnlocked: true };
        case 'GET_USER_WALLET':
          if (req.coin === 'BTC') return { address: 'bc1qmywalletaddress' };
          return { address: null };
        case 'DELETE_QDN_RESOURCE':
          return { success: true };
        case 'PUBLISH_QDN_RESOURCE':
          return { success: true };
        default:
          throw new Error(`unexpected action ${req.action}`);
      }
    });
    (global as any).qdnRequest = mockQdnRequest;
  });

  afterEach(() => {
    delete (global as any).qdnRequest;
    vi.useRealTimers();
  });

  it('publishes only coins marked "published", using the wallet address or override', async () => {
    const result = await publishContactCard(LOCAL_STATE, 'Alice');

    expect(result).not.toBeNull();
    const publishCall = calls.find((c) => c.action === 'PUBLISH_QDN_RESOURCE')!;
    expect(publishCall.name).toBe('Alice');
    expect(publishCall.service).toBe('DOCUMENT');
    expect(publishCall.identifier).toBe('walletium-contactcard');
    expect(publishCall.base64).toMatchObject({
      version: 1,
      addresses: { BTC: 'bc1qmywalletaddress', DOGE: 'D-cold-storage' },
    });
  });

  it('never includes a "private" coin in the published addresses', async () => {
    await publishContactCard(LOCAL_STATE, 'Alice');
    const publishCall = calls.find((c) => c.action === 'PUBLISH_QDN_RESOURCE')!;
    expect(publishCall.base64).not.toHaveProperty('addresses.LTC');
  });

  it('deletes the old resource before publishing the new one, in that order', async () => {
    await publishContactCard(LOCAL_STATE, 'Alice');
    const deleteIndex = calls.findIndex((c) => c.action === 'DELETE_QDN_RESOURCE');
    const publishIndex = calls.findIndex(
      (c) => c.action === 'PUBLISH_QDN_RESOURCE'
    );
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeLessThan(publishIndex);
  });

  it('still publishes when the delete fails (nothing to delete on first publish)', async () => {
    mockQdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      calls.push(req);
      if (req.action === 'DELETE_QDN_RESOURCE') throw { error: 1401 };
      if (req.action === 'UNLOCK_SELECTED_ACCOUNT') return { isUnlocked: true };
      if (req.action === 'GET_USER_WALLET') return { address: 'bc1qmywalletaddress' };
      return { success: true };
    });
    (global as any).qdnRequest = mockQdnRequest;

    const result = await publishContactCard(LOCAL_STATE, 'Alice');
    expect(result).not.toBeNull();
    expect(calls.some((c) => c.action === 'PUBLISH_QDN_RESOURCE')).toBe(true);
  });

  it('returns null and does not publish when the account cannot be unlocked', async () => {
    mockQdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      calls.push(req);
      if (req.action === 'UNLOCK_SELECTED_ACCOUNT') return { isUnlocked: false };
      return { success: true };
    });
    (global as any).qdnRequest = mockQdnRequest;

    const result = await publishContactCard(LOCAL_STATE, 'Alice');
    expect(result).toBeNull();
    expect(calls.some((c) => c.action === 'PUBLISH_QDN_RESOURCE')).toBe(false);
  });
});

describe('debouncedPublishContactCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete (global as any).qdnRequest;
    vi.useRealTimers();
  });

  it('collapses multiple rapid calls into a single publish', async () => {
    const calls: string[] = [];
    (global as any).qdnRequest = vi.fn(async (req: Record<string, unknown>) => {
      calls.push(req.action as string);
      if (req.action === 'UNLOCK_SELECTED_ACCOUNT') return { isUnlocked: true };
      if (req.action === 'GET_USER_WALLET') return { address: 'addr' };
      return { success: true };
    });

    const state: ContactCardLocalState = { BTC: { decision: 'published' } };
    debouncedPublishContactCard(state, 'Alice', 50);
    debouncedPublishContactCard(state, 'Alice', 50);
    debouncedPublishContactCard(state, 'Alice', 50);

    await vi.advanceTimersByTimeAsync(60);

    expect(calls.filter((a) => a === 'PUBLISH_QDN_RESOURCE')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/contactCardQDN.test.ts`
Expected: FAIL - `publishContactCard`/`debouncedPublishContactCard` are not exported

- [ ] **Step 3: Implement publish + debounce (append to `contactCardQDN.ts`)**

```ts
// append to src/utils/contactCardQDN.ts

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
        const address = await resolveAddressForCoin(coin, state.overrideAddress);
        return address ? ([coin, address] as const) : null;
      })
    );

    const addresses: Record<string, string> = {};
    for (const entry of resolved) {
      if (entry) addresses[entry[0]] = entry[1];
    }

    const lastUpdated = Date.now();
    const data: ContactCardQDNData = { version: 1, lastUpdated, addresses };

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

    await qdnRequest({
      action: 'PUBLISH_QDN_RESOURCE',
      service: SERVICE,
      name: userName,
      identifier: IDENTIFIER,
      base64: data,
    });

    return { publishedAt: lastUpdated };
  } catch (error) {
    console.error('Contact Card: Error publishing', error);
    return null;
  }
}

let publishTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedPublishContactCard(
  localState: ContactCardLocalState,
  userName: string,
  delay = 2000
): void {
  if (publishTimeout) clearTimeout(publishTimeout);
  publishTimeout = setTimeout(() => {
    publishContactCard(localState, userName).catch((err) =>
      console.error('Contact Card: Failed to publish', err)
    );
  }, delay);
}
```

Note: the test asserts `base64` equals the plain object (`toMatchObject`), matching the real bridge's `data64`/`base64` field, which accepts an inline-serializable payload the same way `PUBLISH_QDN_RESOURCE` is called elsewhere in this codebase's tests. If a later integration finds the bridge strictly requires an actual base64 *string* rather than an object, wrap `data` with `objectToBase64(data)` from `qapp-core` (same helper `addressBookQDN.ts` used) and update this call site plus the test's expected shape accordingly - that's an integration detail to confirm against the live bridge, not a design change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/contactCardQDN.test.ts`
Expected: PASS (10 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/utils/contactCardQDN.ts src/utils/__tests__/contactCardQDN.test.ts
git commit -m "Add delete-then-republish and debounced publish for contact cards"
```

---

### Task 5: `resolveContact.ts`

**Files:**
- Create: `src/utils/resolveContact.ts`
- Test: `src/utils/__tests__/resolveContact.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/utils/__tests__/resolveContact.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveContact, missingCoinsForCard } from '../resolveContact';
import * as contactCardQDN from '../contactCardQDN';
import type { ChainConfig } from '../../config/chains';
import type { ContactCardLocalState } from '../Types';

vi.mock('../contactCardQDN');

const CHAIN_BTC: ChainConfig = {
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
};

const CHAIN_LTC: ChainConfig = { ...CHAIN_BTC, key: 'LTC', ticker: 'LTC' };

describe('resolveContact', () => {
  afterEach(() => {
    delete (global as any).qdnRequest;
    vi.clearAllMocks();
  });

  it('returns "name-not-found" when GET_NAME_DATA has no owner', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({ owner: null }));

    const result = await resolveContact('Nobody', 'BTC');
    expect(result).toEqual({ status: 'name-not-found', name: 'Nobody' });
  });

  it('returns "name-not-found" when GET_NAME_DATA rejects', async () => {
    (global as any).qdnRequest = vi.fn(async () => {
      throw new Error('not found');
    });
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    const result = await resolveContact('Nobody', 'BTC');
    expect(result.status).toBe('name-not-found');
  });

  it('returns "no-card" when the name exists but has no contact card', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-owner-address' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    const result = await resolveContact('Alice', 'BTC');
    expect(result).toEqual({ status: 'no-card', name: 'Alice' });
  });

  it('returns "coin-not-published" when the card exists but lacks that coin', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-owner-address' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'found',
      data: { version: 1, lastUpdated: 1, addresses: { LTC: 'ltc-address' } },
    });

    const result = await resolveContact('Alice', 'BTC');
    expect(result).toEqual({ status: 'coin-not-published', name: 'Alice', coin: 'BTC' });
  });

  it('returns "resolved" with the address when the coin is published', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-owner-address' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'found',
      data: { version: 1, lastUpdated: 1, addresses: { BTC: 'bc1qalice' } },
    });

    const result = await resolveContact('Alice', 'BTC');
    expect(result).toEqual({
      status: 'resolved',
      address: 'bc1qalice',
      coin: 'BTC',
      name: 'Alice',
    });
  });

  it('returns "fetch-failed" when the card fetch fails, even if the name exists', async () => {
    (global as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-owner-address' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'fetch-failed',
      error: new Error('node unreachable'),
    });

    const result = await resolveContact('Alice', 'BTC');
    expect(result).toEqual({ status: 'fetch-failed', name: 'Alice' });
  });

  it('trims whitespace from the provided name', async () => {
    const qdnMock = vi.fn(async () => ({ owner: 'Q-owner-address' }));
    (global as any).qdnRequest = qdnMock;
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    const result = await resolveContact('  Alice  ', 'BTC');
    expect(result).toEqual({ status: 'no-card', name: 'Alice' });
    expect(qdnMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice' })
    );
  });
});

describe('missingCoinsForCard', () => {
  it('returns chains with no saved decision', () => {
    const state: ContactCardLocalState = { BTC: { decision: 'published' } };
    expect(missingCoinsForCard(state, [CHAIN_BTC, CHAIN_LTC])).toEqual([CHAIN_LTC]);
  });

  it('does not flag a coin explicitly marked private', () => {
    const state: ContactCardLocalState = {
      BTC: { decision: 'published' },
      LTC: { decision: 'private' },
    };
    expect(missingCoinsForCard(state, [CHAIN_BTC, CHAIN_LTC])).toEqual([]);
  });

  it('returns all chains when local state is empty', () => {
    expect(missingCoinsForCard({}, [CHAIN_BTC, CHAIN_LTC])).toEqual([
      CHAIN_BTC,
      CHAIN_LTC,
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/resolveContact.test.ts`
Expected: FAIL - `Cannot find module '../resolveContact'`

- [ ] **Step 3: Implement `resolveContact.ts`**

```ts
// src/utils/resolveContact.ts
import { fetchContactCard } from './contactCardQDN';
import type { ChainConfig } from '../config/chains';
import type { ContactCardLocalState } from './Types';

export type ContactResolution =
  | { status: 'resolved'; address: string; coin: string; name: string }
  | { status: 'coin-not-published'; name: string; coin: string }
  | { status: 'no-card'; name: string }
  | { status: 'name-not-found'; name: string }
  | { status: 'fetch-failed'; name: string };

export async function resolveContact(
  name: string,
  coin: string
): Promise<ContactResolution> {
  const trimmedName = name.trim();

  const [nameData, cardResult] = await Promise.all([
    qdnRequest({ action: 'GET_NAME_DATA', name: trimmedName }).catch(() => null),
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

export function missingCoinsForCard(
  localState: ContactCardLocalState,
  chains: ChainConfig[]
): ChainConfig[] {
  return chains.filter(
    (chain) => (localState[chain.key]?.decision ?? 'undecided') === 'undecided'
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/resolveContact.test.ts`
Expected: PASS (10 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/utils/resolveContact.ts src/utils/__tests__/resolveContact.test.ts
git commit -m "Add shared resolveContact resolver and missingCoinsForCard"
```

---

### Task 6: `contactMru.ts` - recently searched names

**Files:**
- Create: `src/utils/contactMru.ts`
- Test: `src/utils/__tests__/contactMru.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/utils/__tests__/contactMru.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { addRecentContactName, getRecentContactNames } from '../contactMru';

describe('contactMru', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(getRecentContactNames()).toEqual([]);
  });

  it('adds a name to the front of the list', () => {
    addRecentContactName('Alice');
    addRecentContactName('Bob');
    expect(getRecentContactNames()).toEqual(['Bob', 'Alice']);
  });

  it('moves a re-searched name back to the front instead of duplicating it', () => {
    addRecentContactName('Alice');
    addRecentContactName('Bob');
    addRecentContactName('Alice');
    expect(getRecentContactNames()).toEqual(['Alice', 'Bob']);
  });

  it('dedupes case-insensitively', () => {
    addRecentContactName('Alice');
    addRecentContactName('alice');
    expect(getRecentContactNames()).toEqual(['alice']);
  });

  it('caps the list at 5 entries', () => {
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach(addRecentContactName);
    expect(getRecentContactNames()).toEqual(['F', 'E', 'D', 'C', 'B']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/contactMru.test.ts`
Expected: FAIL - `Cannot find module '../contactMru'`

- [ ] **Step 3: Implement `contactMru.ts`**

```ts
// src/utils/contactMru.ts
const STORAGE_KEY = 'walletium-contact-mru';
const MAX_ENTRIES = 5;

export function getRecentContactNames(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentContactName(name: string): string[] {
  const existing = getRecentContactNames().filter(
    (n) => n.toLowerCase() !== name.toLowerCase()
  );
  const next = [name, ...existing].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/contactMru.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/contactMru.ts src/utils/__tests__/contactMru.test.ts
git commit -m "Add recently-searched-contact-name list"
```

---

### Task 7: i18n keys for the new UI

**Files:**
- Modify: `src/i18n/locales/en/core.json`

Adding these up front means every later component task can just call `t('core:...')` without a separate i18n step.

- [ ] **Step 1: Add contact-card and send-dialog keys**

In `src/i18n/locales/en/core.json`, keep the existing `address_book_*` keys for now (removed in Task 14, after nothing references them) and add a new block right after `"address"` (or anywhere convenient at the top level - key order doesn't matter to i18next):

```json
  "contact_card_my_card_title": "my contact card",
  "contact_card_address_loading": "loading address…",
  "contact_card_published": "published",
  "contact_card_private": "private",
  "contact_card_use_different_address": "use a different address",
  "contact_card_override_address_label": "custom address to publish",
  "contact_card_completeness_banner": "{{count}} coin(s) not yet on your card",
  "contact_card_find_person_title": "find a person",
  "contact_card_search_label": "qortium name",
  "contact_card_search_button": "search",
  "contact_card_search_recent": "recently searched",
  "contact_card_search_result_intro": "{{name}} publishes:",
  "contact_card_search_error_name_not_found": "no Qortium name found matching \"{{name}}\"",
  "contact_card_search_error_no_card": "{{name}} doesn't have a contact card yet",
  "contact_card_search_error_fetch_failed": "couldn't check right now - try again",
```

And inside the existing `"send_dialog"` object in the same file, add:

```json
    "recipient_mode_address": "address",
    "recipient_mode_name": "name",
    "recipient_name": "recipient's qortium name",
    "resolving_recipient": "checking…",
    "resolved_to": "sending to {{name}}'s {{ticker}} address: {{address}}",
    "resolution_name_not_found": "no Qortium name found matching \"{{name}}\"",
    "resolution_no_card": "{{name}} doesn't have a contact card yet",
    "resolution_coin_not_published": "{{name}} hasn't published an address for this coin",
    "resolution_fetch_failed": "couldn't check right now - try again",
```

(Read the file first to find the exact `send_dialog` block and existing `recipient_address`/`recipient_invalid` keys so the new ones sit alongside them.)

- [ ] **Step 2: Verify the JSON is still valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en/core.json', 'utf8')); console.log('ok')"`
Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/en/core.json
git commit -m "Add i18n keys for contact card and recipient-by-name UI"
```

---

### Task 8: `ContactCardCoinRow`

**Files:**
- Create: `src/components/ContactCard/ContactCardCoinRow.tsx`
- Test: `src/components/ContactCard/__tests__/ContactCardCoinRow.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/ContactCard/__tests__/ContactCardCoinRow.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeProviderWrapper from '../../../styles/theme/theme-provider';
import i18n from '../../../i18n/i18n';
import { ContactCardCoinRow } from '../ContactCardCoinRow';
import type { ChainConfig } from '../../../config/chains';

const BTC_CHAIN: ChainConfig = {
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
};

function renderRow(
  state = { decision: 'undecided' as const },
  onDecisionChange = vi.fn(),
  onOverrideChange = vi.fn()
) {
  render(
    <ThemeProviderWrapper>
      <ContactCardCoinRow
        chain={BTC_CHAIN}
        state={state}
        onDecisionChange={onDecisionChange}
        onOverrideChange={onOverrideChange}
      />
    </ThemeProviderWrapper>
  );
  return { onDecisionChange, onOverrideChange };
}

describe('ContactCardCoinRow', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    (globalThis as any).qdnRequest = vi.fn(async () => ({
      address: 'bc1qmywalletaddress',
    }));
  });

  afterEach(() => {
    delete (globalThis as any).qdnRequest;
  });

  it('fetches and displays the wallet address for the coin', async () => {
    renderRow();
    expect(await screen.findByText('bc1qmywalletaddress')).toBeInTheDocument();
  });

  it('shows the switch off by default for an undecided coin', () => {
    renderRow();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('shows the switch on when the coin is already published', () => {
    renderRow({ decision: 'published' });
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('calls onDecisionChange("published") when the switch is turned on', async () => {
    const user = userEvent.setup();
    const { onDecisionChange } = renderRow();

    await user.click(screen.getByRole('switch'));

    expect(onDecisionChange).toHaveBeenCalledWith('BTC', 'published');
  });

  it('calls onDecisionChange("private") when an already-published switch is turned off', async () => {
    const user = userEvent.setup();
    const { onDecisionChange } = renderRow({ decision: 'published' });

    await user.click(screen.getByRole('switch'));

    expect(onDecisionChange).toHaveBeenCalledWith('BTC', 'private');
  });

  it('reveals an override text field and calls onOverrideChange when typed', async () => {
    const user = userEvent.setup();
    const { onOverrideChange } = renderRow();

    await user.click(
      screen.getByRole('button', { name: /use a different address/i })
    );
    const overrideField = screen.getByLabelText(/custom address to publish/i);
    await user.type(overrideField, 'bc1qcoldstorage');

    await waitFor(() =>
      expect(onOverrideChange).toHaveBeenLastCalledWith('BTC', 'bc1qcoldstorage')
    );
  });

  it('pre-opens the override field and shows the override value when one is already set', () => {
    renderRow({ decision: 'published', overrideAddress: 'bc1qcoldstorage' });
    expect(screen.getByDisplayValue('bc1qcoldstorage')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ContactCard/__tests__/ContactCardCoinRow.test.tsx`
Expected: FAIL - `Cannot find module '../ContactCardCoinRow'`

- [ ] **Step 3: Implement `ContactCardCoinRow.tsx`**

```tsx
// src/components/ContactCard/ContactCardCoinRow.tsx
import { useEffect, useState } from 'react';
import { Box, Button, FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ChainConfig } from '../../config/chains';
import type { ContactCardCoinState } from '../../utils/Types';
import { EMPTY_STRING } from '../../common/constants';

interface Props {
  chain: ChainConfig;
  state: ContactCardCoinState;
  onDecisionChange: (coin: string, decision: 'published' | 'private') => void;
  onOverrideChange: (coin: string, address: string | undefined) => void;
}

function walletRequestForChain(chain: ChainConfig) {
  return chain.isNative
    ? { action: 'GET_USER_WALLET', assetId: 0 }
    : { action: 'GET_USER_WALLET', coin: chain.coinEnum };
}

export function ContactCardCoinRow({
  chain,
  state,
  onDecisionChange,
  onOverrideChange,
}: Props) {
  const { t } = useTranslation(['core']);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(!!state.overrideAddress);
  const [overrideValue, setOverrideValue] = useState(
    state.overrideAddress ?? EMPTY_STRING
  );

  useEffect(() => {
    let cancelled = false;
    qdnRequest(walletRequestForChain(chain) as any)
      .then((res: any) => {
        if (!cancelled) setWalletAddress(res?.address ?? null);
      })
      .catch(() => {
        if (!cancelled) setWalletAddress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chain]);

  const published = state.decision === 'published';
  const displayedAddress = state.overrideAddress || walletAddress;

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 1.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ minWidth: 64, fontWeight: 700 }}>
          {chain.ticker}
        </Typography>
        <Typography
          sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}
          noWrap
        >
          {displayedAddress ?? t('core:contact_card_address_loading')}
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={published}
              onChange={(e) =>
                onDecisionChange(
                  chain.key,
                  e.target.checked ? 'published' : 'private'
                )
              }
            />
          }
          label={
            published
              ? t('core:contact_card_published')
              : t('core:contact_card_private')
          }
        />
      </Box>
      <Button
        size="small"
        onClick={() => setOverrideOpen((v) => !v)}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('core:contact_card_use_different_address')}
      </Button>
      {overrideOpen && (
        <TextField
          size="small"
          fullWidth
          label={t('core:contact_card_override_address_label')}
          value={overrideValue}
          onChange={(e) => {
            const value = e.target.value.trim();
            setOverrideValue(value);
            onOverrideChange(chain.key, value || undefined);
          }}
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ContactCard/__tests__/ContactCardCoinRow.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ContactCard/ContactCardCoinRow.tsx src/components/ContactCard/__tests__/ContactCardCoinRow.test.tsx
git commit -m "Add ContactCardCoinRow"
```

---

### Task 9: `ContactCardCompletenessBanner`

**Files:**
- Create: `src/components/ContactCard/ContactCardCompletenessBanner.tsx`
- Test: `src/components/ContactCard/__tests__/ContactCardCompletenessBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/ContactCard/__tests__/ContactCardCompletenessBanner.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThemeProviderWrapper from '../../../styles/theme/theme-provider';
import i18n from '../../../i18n/i18n';
import { ContactCardCompletenessBanner } from '../ContactCardCompletenessBanner';
import type { ChainConfig } from '../../../config/chains';

const chain = (key: string): ChainConfig => ({
  key,
  name: key,
  ticker: key,
  coinEnum: key,
  route: key.toLowerCase(),
  defaultFee: 0.001,
  isNative: false,
  decimalPlaces: 8,
  activeNetwork: 'MAIN',
  supportsHtlc: true,
  supportsLocalChainTrades: true,
});

describe('ContactCardCompletenessBanner', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders nothing when there are no missing coins', () => {
    const { container } = render(
      <ThemeProviderWrapper>
        <ContactCardCompletenessBanner missingChains={[]} />
      </ThemeProviderWrapper>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and a chip per missing coin', () => {
    render(
      <ThemeProviderWrapper>
        <ContactCardCompletenessBanner
          missingChains={[chain('DGB'), chain('RVN')]}
        />
      </ThemeProviderWrapper>
    );
    expect(screen.getByText(/2 coin/i)).toBeInTheDocument();
    expect(screen.getByText('DGB')).toBeInTheDocument();
    expect(screen.getByText('RVN')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ContactCard/__tests__/ContactCardCompletenessBanner.test.tsx`
Expected: FAIL - `Cannot find module '../ContactCardCompletenessBanner'`

- [ ] **Step 3: Implement `ContactCardCompletenessBanner.tsx`**

```tsx
// src/components/ContactCard/ContactCardCompletenessBanner.tsx
import { Alert, Box, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ChainConfig } from '../../config/chains';

interface Props {
  missingChains: ChainConfig[];
}

export function ContactCardCompletenessBanner({ missingChains }: Props) {
  const { t } = useTranslation(['core']);

  if (missingChains.length === 0) return null;

  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      {t('core:contact_card_completeness_banner', {
        count: missingChains.length,
      })}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
        {missingChains.map((chain) => (
          <Chip key={chain.key} size="small" label={chain.ticker} />
        ))}
      </Box>
    </Alert>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ContactCard/__tests__/ContactCardCompletenessBanner.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ContactCard/ContactCardCompletenessBanner.tsx src/components/ContactCard/__tests__/ContactCardCompletenessBanner.test.tsx
git commit -m "Add ContactCardCompletenessBanner"
```

---

### Task 10: `MyContactCardPage`

**Files:**
- Create: `src/components/ContactCard/MyContactCardPage.tsx`
- Test: `src/components/ContactCard/__tests__/MyContactCardPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/ContactCard/__tests__/MyContactCardPage.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeProviderWrapper from '../../../styles/theme/theme-provider';
import i18n from '../../../i18n/i18n';
import { MyContactCardPage } from '../MyContactCardPage';

vi.mock('qapp-core', () => ({
  useGlobal: () => ({ auth: { name: 'Alice' } }),
}));

vi.mock('../../../hooks/useSupportedChains', () => ({
  useSupportedChains: () => ({
    chains: [
      {
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
      },
      {
        key: 'LTC',
        name: 'Litecoin',
        ticker: 'LTC',
        coinEnum: 'LTC',
        route: 'litecoin',
        defaultFee: 0.001,
        isNative: false,
        decimalPlaces: 8,
        activeNetwork: 'MAIN',
        supportsHtlc: true,
        supportsLocalChainTrades: true,
      },
    ],
    status: 'live',
  }),
}));

const debouncedPublishContactCard = vi.fn();
vi.mock('../../../utils/contactCardQDN', () => ({
  debouncedPublishContactCard: (...args: unknown[]) =>
    debouncedPublishContactCard(...args),
}));

describe('MyContactCardPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    debouncedPublishContactCard.mockClear();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ address: 'addr' }));
  });

  afterEach(() => {
    delete (globalThis as any).qdnRequest;
  });

  function renderPage() {
    return render(
      <ThemeProviderWrapper>
        <MyContactCardPage />
      </ThemeProviderWrapper>
    );
  }

  it('renders one row per supported chain', () => {
    renderPage();
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('LTC')).toBeInTheDocument();
  });

  it('shows the completeness banner for coins with no saved decision', () => {
    renderPage();
    expect(screen.getByText(/2 coin/i)).toBeInTheDocument();
  });

  it('publishing debounced when a switch is toggled, and the banner count drops', async () => {
    const user = userEvent.setup();
    renderPage();

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

    expect(debouncedPublishContactCard).toHaveBeenCalledWith(
      expect.objectContaining({ BTC: { decision: 'published' } }),
      'Alice'
    );
    expect(screen.getByText(/1 coin/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ContactCard/__tests__/MyContactCardPage.test.tsx`
Expected: FAIL - `Cannot find module '../MyContactCardPage'`

- [ ] **Step 3: Implement `MyContactCardPage.tsx`**

```tsx
// src/components/ContactCard/MyContactCardPage.tsx
import { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useGlobal } from 'qapp-core';
import { useSupportedChains } from '../../hooks/useSupportedChains';
import {
  getContactCardLocalState,
  setCoinDecision,
  setCoinOverrideAddress,
} from '../../utils/contactCardStorage';
import { debouncedPublishContactCard } from '../../utils/contactCardQDN';
import { missingCoinsForCard } from '../../utils/resolveContact';
import type { ContactCardLocalState } from '../../utils/Types';
import { ContactCardCoinRow } from './ContactCardCoinRow';
import { ContactCardCompletenessBanner } from './ContactCardCompletenessBanner';

export function MyContactCardPage() {
  const { t } = useTranslation(['core']);
  const { chains } = useSupportedChains();
  const userName = useGlobal().auth.name as string | undefined;
  const [localState, setLocalState] = useState<ContactCardLocalState>(() =>
    getContactCardLocalState()
  );

  const missingChains = useMemo(
    () => missingCoinsForCard(localState, chains),
    [localState, chains]
  );

  const handleDecisionChange = (
    coin: string,
    decision: 'published' | 'private'
  ) => {
    const next = setCoinDecision(coin, decision);
    setLocalState(next);
    if (userName) debouncedPublishContactCard(next, userName);
  };

  const handleOverrideChange = (coin: string, address: string | undefined) => {
    const next = setCoinOverrideAddress(coin, address);
    setLocalState(next);
    if (userName) debouncedPublishContactCard(next, userName);
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: 3 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('core:contact_card_my_card_title')}
      </Typography>
      <ContactCardCompletenessBanner missingChains={missingChains} />
      <Box>
        {chains.map((chain) => (
          <ContactCardCoinRow
            key={chain.key}
            chain={chain}
            state={localState[chain.key] ?? { decision: 'undecided' }}
            onDecisionChange={handleDecisionChange}
            onOverrideChange={handleOverrideChange}
          />
        ))}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ContactCard/__tests__/MyContactCardPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ContactCard/MyContactCardPage.tsx src/components/ContactCard/__tests__/MyContactCardPage.test.tsx
git commit -m "Add MyContactCardPage"
```

---

### Task 11: `FindPersonPage`

**Files:**
- Create: `src/components/ContactCard/FindPersonPage.tsx`
- Test: `src/components/ContactCard/__tests__/FindPersonPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/ContactCard/__tests__/FindPersonPage.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeProviderWrapper from '../../../styles/theme/theme-provider';
import i18n from '../../../i18n/i18n';
import { FindPersonPage } from '../FindPersonPage';
import * as contactCardQDN from '../../../utils/contactCardQDN';

vi.mock('../../../utils/contactCardQDN');

vi.mock('../../../hooks/useSupportedChains', () => ({
  useSupportedChains: () => ({
    chains: [
      {
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
      },
      {
        key: 'LTC',
        name: 'Litecoin',
        ticker: 'LTC',
        coinEnum: 'LTC',
        route: 'litecoin',
        defaultFee: 0.001,
        isNative: false,
        decimalPlaces: 8,
        activeNetwork: 'MAIN',
        supportsHtlc: true,
        supportsLocalChainTrades: true,
      },
    ],
    status: 'live',
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProviderWrapper>
        <FindPersonPage />
      </ThemeProviderWrapper>
    </MemoryRouter>
  );
}

describe('FindPersonPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as any).qdnRequest;
    vi.clearAllMocks();
  });

  it('shows only the coins the found person has published', async () => {
    const user = userEvent.setup();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-addr' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'found',
      data: { version: 1, lastUpdated: 1, addresses: { BTC: 'bc1qalice' } },
    });

    renderPage();
    await user.type(screen.getByLabelText(/qortium name/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText('BTC')).toBeInTheDocument();
    expect(screen.queryByText('LTC')).not.toBeInTheDocument();
  });

  it('shows a name-not-found message when the name does not resolve', async () => {
    const user = userEvent.setup();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ owner: null }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    renderPage();
    await user.type(screen.getByLabelText(/qortium name/i), 'Nobody');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(
      await screen.findByText(/no qortium name found matching "Nobody"/i)
    ).toBeInTheDocument();
  });

  it('shows a no-card message when the name exists but has no card', async () => {
    const user = userEvent.setup();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-addr' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    renderPage();
    await user.type(screen.getByLabelText(/qortium name/i), 'Bob');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(
      await screen.findByText(/bob doesn't have a contact card yet/i)
    ).toBeInTheDocument();
  });

  it('adds a successfully found name to the recent list on the next render', async () => {
    const user = userEvent.setup();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-addr' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'found',
      data: { version: 1, lastUpdated: 1, addresses: { BTC: 'bc1qalice' } },
    });

    renderPage();
    await user.type(screen.getByLabelText(/qortium name/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('BTC');

    expect(
      JSON.parse(localStorage.getItem('walletium-contact-mru') ?? '[]')
    ).toEqual(['Alice']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ContactCard/__tests__/FindPersonPage.test.tsx`
Expected: FAIL - `Cannot find module '../FindPersonPage'`

- [ ] **Step 3: Implement `FindPersonPage.tsx`**

```tsx
// src/components/ContactCard/FindPersonPage.tsx
import { useState } from 'react';
import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSupportedChains } from '../../hooks/useSupportedChains';
import { fetchContactCard } from '../../utils/contactCardQDN';
import { addRecentContactName, getRecentContactNames } from '../../utils/contactMru';
import { EMPTY_STRING } from '../../common/constants';
import type { ChainConfig } from '../../config/chains';

type SearchError = 'name-not-found' | 'no-card' | 'fetch-failed';

export function FindPersonPage() {
  const { t } = useTranslation(['core']);
  const navigate = useNavigate();
  const { chains } = useSupportedChains();

  const [name, setName] = useState(EMPTY_STRING);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string> | null>(
    null
  );
  const [resolvedName, setResolvedName] = useState(EMPTY_STRING);
  const [recent, setRecent] = useState(() => getRecentContactNames());

  async function handleSearch() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSearching(true);
    setError(null);
    setAddresses(null);

    try {
      const nameData = await qdnRequest({
        action: 'GET_NAME_DATA',
        name: trimmedName,
      } as any).catch(() => null);

      if (!(nameData as { owner?: string } | null)?.owner) {
        setError('name-not-found');
        return;
      }

      const cardResult = await fetchContactCard(trimmedName);
      if (cardResult.status === 'not-found') {
        setError('no-card');
        return;
      }
      if (cardResult.status === 'fetch-failed') {
        setError('fetch-failed');
        return;
      }

      setResolvedName(trimmedName);
      setAddresses(cardResult.data.addresses);
      setRecent(addRecentContactName(trimmedName));
    } finally {
      setSearching(false);
    }
  }

  const matchingChains: ChainConfig[] = addresses
    ? chains.filter((chain) => addresses[chain.key])
    : [];

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', p: 3 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('core:contact_card_find_person_title')}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          label={t('core:contact_card_search_label')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={searching}
        />
        <Button
          variant="contained"
          onClick={handleSearch}
          disabled={searching || !name.trim()}
        >
          {t('core:contact_card_search_button')}
        </Button>
      </Box>

      {recent.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ width: '100%' }}>
            {t('core:contact_card_search_recent')}
          </Typography>
          {recent.map((recentName) => (
            <Chip
              key={recentName}
              size="small"
              label={recentName}
              onClick={() => setName(recentName)}
            />
          ))}
        </Box>
      )}

      {error && (
        <Typography color="error">
          {t(`core:contact_card_search_error_${error.replace(/-/g, '_')}`, {
            name: name.trim(),
          })}
        </Typography>
      )}

      {addresses && (
        <>
          <Typography sx={{ mb: 1 }}>
            {t('core:contact_card_search_result_intro', { name: resolvedName })}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {matchingChains.map((chain) => (
              <Button
                key={chain.key}
                variant="outlined"
                onClick={() =>
                  navigate(
                    `/${chain.route}?to=${encodeURIComponent(
                      addresses[chain.key]
                    )}&fromName=${encodeURIComponent(resolvedName)}`
                  )
                }
              >
                {chain.ticker}
              </Button>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ContactCard/__tests__/FindPersonPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ContactCard/FindPersonPage.tsx src/components/ContactCard/__tests__/FindPersonPage.test.tsx
git commit -m "Add FindPersonPage"
```

---

### Task 12: Wire `/contacts` and `/contacts/find` into routing and the top bar

**Files:**
- Modify: `src/routes/Routes.tsx`
- Modify: `src/components/layout/TopBar.tsx`

- [ ] **Step 1: Add the routes**

In `src/routes/Routes.tsx`, add the imports and two new children:

```tsx
import { MyContactCardPage } from '../components/ContactCard/MyContactCardPage';
import { FindPersonPage } from '../components/ContactCard/FindPersonPage';
```

```tsx
      { path: 'history', element: <UnifiedHistory /> },
      { path: 'contacts', element: <MyContactCardPage /> },
      { path: 'contacts/find', element: <FindPersonPage /> },
```

- [ ] **Step 2: Add a TopBar nav icon**

In `src/components/layout/TopBar.tsx`, add the import:

```tsx
import ContactsIcon from '@mui/icons-material/Contacts';
```

and, right after the existing "All transactions" `Tooltip`/`IconButton` block (the one navigating to `/history`), add:

```tsx
        {/* Contact cards */}
        <Tooltip title="Contact cards" placement="bottom">
          <IconButton
            size="small"
            onClick={() =>
              navigate(pathname.startsWith('/contacts') ? '/' : '/contacts')
            }
            sx={{
              ...buttonSx,
              color: pathname.startsWith('/contacts') ? c.accent : c.textSecondary,
            }}
            aria-label="contact cards"
          >
            <ContactsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
```

- [ ] **Step 3: Manually verify routing**

Run: `npm run dev`, open the app, click the new contacts icon in the top bar, confirm it navigates to the "my contact card" page and back.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Routes.tsx src/components/layout/TopBar.tsx
git commit -m "Wire contact card pages into routing and the top bar"
```

---

### Task 13: `CoinDetail.tsx` - Name/Address recipient tabs + resolver

**Files:**
- Modify: `src/components/wallet/CoinDetail.tsx`
- Test: `src/components/wallet/__tests__/CoinDetail.send.test.tsx`

- [ ] **Step 1: Write the failing tests (append to the existing file)**

```tsx
// append to src/components/wallet/__tests__/CoinDetail.send.test.tsx
import * as resolveContactModule from '../../../utils/resolveContact';

vi.mock('../../../utils/resolveContact');

describe('CoinDetail recipient-by-name flow', () => {
  let qdnRequestMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();

    qdnRequestMock = vi.fn(async (opts: Record<string, unknown>) => {
      switch (opts.action) {
        case 'SHOW_ACTIONS':
          return ['SEND_COIN', 'GET_WALLET_BALANCE'];
        case 'GET_USER_WALLET':
          return { address: 'btc-wallet-address' };
        case 'GET_WALLET_BALANCE':
          return '123456789';
        case 'GET_USER_WALLET_TRANSACTIONS':
          return [];
        case 'GET_FOREIGN_FEE':
          return { fee: '0.0002' };
        case 'UNLOCK_SELECTED_ACCOUNT':
          return { isUnlocked: true };
        case 'SEND_COIN':
          return preparedResult(opts);
        default:
          return null;
      }
    });
    (globalThis as any).qdnRequest = qdnRequestMock;
  });

  afterEach(() => {
    delete (globalThis as any).qdnRequest;
  });

  it('defaults to Address mode with the plain recipient field', async () => {
    const user = userEvent.setup();
    renderDetail();
    await openSendDialog(user);

    expect(screen.getByLabelText(/recipient address/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/recipient's qortium name/i)).not.toBeInTheDocument();
  });

  it('switching to Name mode resolves and displays the address, and Confirm Send uses it', async () => {
    const user = userEvent.setup();
    vi.mocked(resolveContactModule.resolveContact).mockResolvedValue({
      status: 'resolved',
      address: 'btc-resolved-address',
      coin: 'BTC',
      name: 'Alice',
    });

    renderDetail();
    await openSendDialog(user);
    await user.click(screen.getByRole('button', { name: /^name$/i }));
    await user.type(screen.getByLabelText(/recipient's qortium name/i), 'Alice');

    expect(
      await screen.findByText(/sending to Alice's BTC address: btc-resolved-address/i)
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/amount \(BTC\)/i), '1.25');
    await user.click(screen.getByRole('button', { name: /confirm send/i }));

    await waitFor(() => expect(sendCalls(qdnRequestMock)).toHaveLength(1));
    expect(sendCalls(qdnRequestMock)[0]).toMatchObject({
      recipient: 'btc-resolved-address',
    });
  });

  it('shows the coin-not-published message and disables Confirm Send', async () => {
    const user = userEvent.setup();
    vi.mocked(resolveContactModule.resolveContact).mockResolvedValue({
      status: 'coin-not-published',
      name: 'Alice',
      coin: 'BTC',
    });

    renderDetail();
    await openSendDialog(user);
    await user.click(screen.getByRole('button', { name: /^name$/i }));
    await user.type(screen.getByLabelText(/recipient's qortium name/i), 'Alice');
    await user.type(screen.getByLabelText(/amount \(BTC\)/i), '1.25');

    expect(
      await screen.findByText(/alice hasn't published an address for this coin/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm send/i })).toBeDisabled();
  });

  it('re-resolves right before sending and blocks if the address changed since the field was filled', async () => {
    const user = userEvent.setup();
    vi.mocked(resolveContactModule.resolveContact)
      .mockResolvedValueOnce({
        status: 'resolved',
        address: 'btc-old-address',
        coin: 'BTC',
        name: 'Alice',
      })
      .mockResolvedValueOnce({
        status: 'resolved',
        address: 'btc-new-address',
        coin: 'BTC',
        name: 'Alice',
      });

    renderDetail();
    await openSendDialog(user);
    await user.click(screen.getByRole('button', { name: /^name$/i }));
    await user.type(screen.getByLabelText(/recipient's qortium name/i), 'Alice');
    await screen.findByText(/btc-old-address/i);
    await user.type(screen.getByLabelText(/amount \(BTC\)/i), '1.25');

    await user.click(screen.getByRole('button', { name: /confirm send/i }));

    await waitFor(() =>
      expect(screen.getByText(/btc-new-address/i)).toBeInTheDocument()
    );
    expect(sendCalls(qdnRequestMock)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/wallet/__tests__/CoinDetail.send.test.tsx`
Expected: FAIL - no "Name"/"Address" mode buttons exist yet, `recipient's qortium name` field not found

- [ ] **Step 3: Implement the recipient mode toggle and resolver wiring in `CoinDetail.tsx`**

Add the import near the top (with the other util imports around line 50-54):

```tsx
import { resolveContact, type ContactResolution } from '../../utils/resolveContact';
```

Add a debounce constant near the other top-of-file constants (with `ARRR_OUTER_MAX` etc., around line 73-75):

```tsx
const RECIPIENT_NAME_LOOKUP_DEBOUNCE_MS = 800;
```

Add new state alongside the existing `recipient` state (around line 118-120):

```tsx
  const [recipientMode, setRecipientMode] = useState<'address' | 'name'>('address');
  const [recipientName, setRecipientName] = useState(EMPTY_STRING);
  const [resolution, setResolution] = useState<ContactResolution | null>(null);
  const [resolvingRecipient, setResolvingRecipient] = useState(false);
```

Reset the new state alongside the existing resets in `openSend` (around line 411-419) and `closeSend` (around line 493-503) - add these four lines to each function's existing reset block:

```tsx
    setRecipientMode('address');
    setRecipientName(EMPTY_STRING);
    setResolution(null);
    setResolvingRecipient(false);
```

Add a debounced-resolution effect (place it near `openSend`, after its `useCallback` block):

```tsx
  useEffect(() => {
    if (recipientMode !== 'name') return;
    const trimmed = recipientName.trim();
    if (!trimmed) {
      setResolution(null);
      setRecipient(EMPTY_STRING);
      return;
    }
    let cancelled = false;
    setResolvingRecipient(true);
    const timeout = setTimeout(async () => {
      const result = await resolveContact(trimmed, chain.coinEnum);
      if (cancelled) return;
      setResolution(result);
      setRecipient(result.status === 'resolved' ? result.address : EMPTY_STRING);
      setResolvingRecipient(false);
    }, RECIPIENT_NAME_LOOKUP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [recipientName, recipientMode, chain.coinEnum]);
```

Modify `handleSend` (around line 446-491) to re-resolve immediately before sending when in Name mode, and to use the freshly-resolved address rather than trusting the possibly-stale `recipient` state:

```tsx
  const handleSend = async () => {
    if (!canConfirmSend) return;

    setSending(true);
    try {
      if (!(await ensureAccountUnlocked())) return;

      let effectiveRecipient = recipient;
      if (recipientMode === 'name') {
        const fresh = await resolveContact(recipientName.trim(), chain.coinEnum);
        setResolution(fresh);
        if (fresh.status !== 'resolved') return;
        if (fresh.address !== recipient) {
          setRecipient(fresh.address);
          return; // address changed since the field was filled - force re-confirmation
        }
        effectiveRecipient = fresh.address;
      }

      let result: SendCoinResult | null = null;
      if (chain.isNative) {
        const res = await qdnRequest({
          action: 'SEND_QORT',
          recipient: effectiveRecipient,
          amount: parseFloat(amount),
        } as any);
        if (res?.accepted === false)
          throw new Error(res.error ?? 'SEND_QORT failed');
        result = res as any;
      } else {
        const payload: Record<string, unknown> = {
          action: 'SEND_COIN',
          recipient: effectiveRecipient,
          coin: chain.coinEnum,
        };
        if (canUseForeignSendMax && sendMax) {
          payload.sendMax = true;
        } else {
          payload.amount = amount;
        }
        if (chain.coinEnum !== 'ARRR' && foreignFeePerByte !== '') {
          payload.feePerByte = foreignFeePerByte.trim();
        }
        result = (await qdnRequest(payload as any)) as SendCoinResult | null;
      }
      setSendResponse(result);
      setSendResult('success');

      window.setTimeout(() => {
        fetchBalance();
        fetchTransactions();
      }, TIME_SECONDS_3);
    } catch {
      setSendResponse(null);
      setSendResult('error');
    } finally {
      setSending(false);
    }
  };
```

Replace the single recipient `TextField` (lines 1291-1303) with the mode toggle and both fields:

```tsx
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant={recipientMode === 'address' ? 'contained' : 'outlined'}
                    onClick={() => setRecipientMode('address')}
                    disabled={sending}
                  >
                    {t('send_dialog.recipient_mode_address')}
                  </Button>
                  <Button
                    size="small"
                    variant={recipientMode === 'name' ? 'contained' : 'outlined'}
                    onClick={() => setRecipientMode('name')}
                    disabled={sending}
                  >
                    {t('send_dialog.recipient_mode_name')}
                  </Button>
                </Box>

                {recipientMode === 'address' ? (
                  <TextField
                    label={t('send_dialog.recipient_address')}
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value.trim())}
                    fullWidth
                    disabled={sending}
                    error={showRecipientError}
                    helperText={
                      showRecipientError
                        ? t('send_dialog.recipient_invalid')
                        : undefined
                    }
                  />
                ) : (
                  <>
                    <TextField
                      label={t('send_dialog.recipient_name')}
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      fullWidth
                      disabled={sending}
                    />
                    {resolvingRecipient && (
                      <Typography variant="caption">
                        {t('send_dialog.resolving_recipient')}
                      </Typography>
                    )}
                    {!resolvingRecipient && resolution?.status === 'resolved' && (
                      <Typography variant="caption" sx={{ color: c.success }}>
                        {t('send_dialog.resolved_to', {
                          name: resolution.name,
                          ticker: chain.ticker,
                          address: resolution.address,
                        })}
                      </Typography>
                    )}
                    {!resolvingRecipient &&
                      resolution &&
                      resolution.status !== 'resolved' && (
                        <Typography variant="caption" sx={{ color: c.danger }}>
                          {t(
                            `send_dialog.resolution_${resolution.status.replace(/-/g, '_')}`,
                            { name: resolution.name }
                          )}
                        </Typography>
                      )}
                  </>
                )}
```

`Typography` must already be imported at the top of `CoinDetail.tsx` (it is, per the existing `import { ... Typography } from '@mui/material';` block) - if not, add it to that import list.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/wallet/__tests__/CoinDetail.send.test.tsx`
Expected: PASS (all tests in the file, including the pre-existing foreign-send tests and the new recipient-by-name tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/wallet/CoinDetail.tsx src/components/wallet/__tests__/CoinDetail.send.test.tsx
git commit -m "Add Name/Address recipient modes to the send flow, with pre-send re-resolution"
```

---

### Task 14: Remove the old Address Book

**Files:**
- Delete: `src/components/AddressBook/` (entire folder)
- Delete: `src/utils/addressBookStorage.ts`, `src/utils/__tests__/addressBookStorage.test.ts`
- Delete: `src/utils/addressBookQDN.ts`, `src/utils/__tests__/addressBookQDN.test.ts`
- Modify: `src/AppLayout.tsx`
- Modify: `src/common/constants.ts`
- Modify: `src/i18n/locales/en/core.json`
- Modify: 17 other locale `core.json` files (mechanical key removal)

This is safe to do now: Task 1 already removed `AddressBookEntry` from `Types.tsx`, so anything still importing it (only files in this deletion list) is already red in `tsc`, confirming nothing else in the app depends on it.

- [ ] **Step 1: Delete the Address Book component folder and its standalone utils**

```bash
git rm -r src/components/AddressBook
git rm src/utils/addressBookStorage.ts src/utils/__tests__/addressBookStorage.test.ts
git rm src/utils/addressBookQDN.ts src/utils/__tests__/addressBookQDN.test.ts
```

- [ ] **Step 2: Remove the startup sync call from `AppLayout.tsx`**

In `src/AppLayout.tsx`, remove the import (line 12):

```tsx
import { syncAllAddressBooksOnStartup } from './utils/addressBookQDN';
```

and remove the effect that calls it (lines 80-84):

```tsx
  useEffect(() => {
    if (address && name) {
      syncAllAddressBooksOnStartup(name).catch(() => {});
    }
  }, [address, name]);
```

- [ ] **Step 3: Remove the address-book constants**

In `src/common/constants.ts`, remove these three lines:

```ts
export const ADDRESSBOOK_NAME_LENGTH: number = 50;
export const ADDRESSBOOK_NOTE_LENGTH: number = 200;
export const ADDRESSBOOK_ROWS_PER_PAGE: number = 5;
```

- [ ] **Step 4: Remove `address_book_*` keys from the English locale**

In `src/i18n/locales/en/core.json`, remove every key whose name starts with `address_book_` (the block currently sitting right after `"address": "address:",` - see the earlier grep output for the full list of ~27 keys). Leave `"address": "address:"` and `"action.double_click_addressbook"` alone - the latter is a pre-existing, already-unused key unrelated to this feature; removing it is out of scope here.

- [ ] **Step 5: Strip the same keys from every other locale file**

Every other locale's `core.json` carries the identical `address_book_*` key set (with translated values). Remove them mechanically:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const localesDir = path.join('src', 'i18n', 'locales');
for (const lang of fs.readdirSync(localesDir)) {
  if (lang === 'en') continue;
  const file = path.join(localesDir, lang, 'core.json');
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of Object.keys(data)) {
    if (key.startsWith('address_book_')) delete data[key];
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log('cleaned', file);
}
"
```

- [ ] **Step 6: Verify the project typechecks and the full test suite passes**

Run: `npx tsc -b --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (no leftover references to the deleted Address Book files)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Remove the old private Address Book (superseded by contact cards)"
```

---

### Task 15: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including every file touched or added in Tasks 1-14

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (warnings acceptable only if they pre-date this change - do not introduce new ones)

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, then:
1. Open the new "Contacts" icon in the top bar -> confirm "My Contact Card" lists every supported coin with a Publish/Private switch and the completeness banner shows a nonzero count on a fresh profile.
2. Toggle one coin to Published, confirm the banner count drops by one.
3. Navigate to `/contacts/find`, search for a name that has no card, confirm the "doesn't have a contact card yet" message appears.
4. Open any coin's Send dialog, switch to "Name" mode, type a name, confirm it either resolves and shows the address or shows an appropriate error - and that "Address" mode still works exactly as before.

- [ ] **Step 5: Commit (only if the smoke test required fixes)**

```bash
git add -A
git commit -m "Fix issues found during contact cards smoke test"
```

---

## Self-Review Notes

- **Spec coverage:** per-coin publish/private toggle (Task 8/10), auto address from the wallet with manual override (Task 8), completeness banner scoped to "every supported coin" but only nagging on `undecided` not `private` (Task 5/9/10), delete-then-republish (Task 4), always-fresh resolution with five distinct states including `fetch-failed` kept separate from `no-card`/`coin-not-published` (Task 5), two entry paths sharing one resolver (Task 11 uses `fetchContactCard` + the same name-existence check directly rather than calling `resolveContact` once per coin, which is a deliberate efficiency choice noted in the design doc - both paths still go through the identical fetch/parse logic in `contactCardQDN.ts`), raw address paste always available as a first-class tab (Task 13), final pre-send re-resolution that blocks and updates on mismatch (Task 13) - all covered.
- **Type consistency:** `ContactCardCoinState.decision` (`'published' | 'private' | 'undecided'`), `ContactResolution.status` values, and the `contact_card_search_error_*`/`send_dialog.resolution_*` i18n key suffixes (`name_not_found`, `no_card`, `coin_not_published`, `fetch_failed`, generated via `.replace(/-/g, '_')`) are used identically across Tasks 5, 9, 10, 11, 13.
- **Deferred/flagged items surfaced inline rather than hidden:** the `base64` vs `objectToBase64(...)` question in Task 4 Step 3, and the English-only i18n scope noted at the top of the plan - both are explicit, bounded decisions with a stated fallback, not vague placeholders.
