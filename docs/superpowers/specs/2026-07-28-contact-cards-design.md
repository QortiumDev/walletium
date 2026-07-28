# Wallet: Contact Cards (replaces Address Book)

**Date:** 2026-07-28
**Status:** Approved

---

## Overview

Replace the private, per-user Address Book (`src/components/AddressBook/*`, `src/utils/addressBookStorage.ts`, `src/utils/addressBookQDN.ts`) with **contact cards**: each person publishes their own receive addresses, per coin, under their own registered Qortium name. Sending to someone becomes "type their name, pick a coin" instead of "hope you already saved their address correctly."

Note on current state: `AddressBookDialog` and friends exist but are never actually opened anywhere in the app today (`AddressBookDialog` is imported only by its own test file - `AppLayout.tsx` only calls the QDN *sync* function, not the dialog). There is no existing send-flow integration to migrate; the `recipient` field in `CoinDetail.tsx`'s send dialog is a plain address `TextField` today. So this is greenfield UI work for the send flow, and a clean deletion for the old Address Book files.

Core shift from today's model:

- **Today:** `DOCUMENT_PRIVATE` QDN resource per coin per user (`walletium-addressbook-{coin}`), holding *other people's* addresses that the user typed in by hand. Private to the owner; never shared.
- **New:** one `DOCUMENT` (public) QDN resource per user (`walletium-contactcard`), holding a map of *that user's own* coin -> address, built automatically from the wallet's own managed addresses. Anyone can resolve it by name.

No manual "saved addresses for other people" list survives this change (confirmed: fully replace, no personal address book fallback). Raw address paste remains a fully supported, always-available, unsaved input mode.

---

## Data model

**Public QDN resource** (one per user, published under their own name):

```ts
interface ContactCardQDNData {
  version: 1;
  lastUpdated: number; // Unix timestamp
  addresses: {
    [coinKey: string]: string; // e.g. { QORT: "Q...", BTC: "bc1q..." }
  };
}
```

Published as:

```ts
{
  action: 'PUBLISH_QDN_RESOURCE',
  service: 'DOCUMENT',       // public - not DOCUMENT_PRIVATE
  name: <owner's registered name>,
  identifier: 'walletium-contactcard',
  base64: <base64 of ContactCardQDNData>,
}
```

Coins the owner has chosen not to publish are **omitted from `addresses` entirely** - never included with a "private" flag. A coin key's mere presence in this document is the public signal that it's shared.

**Local state** (card owner's device only, drives what gets published): a jotai atom-backed record, one entry per coin the wallet knows about:

```ts
interface ContactCardCoinState {
  decision: 'published' | 'private' | 'undecided'; // undecided = never touched by the user
  overrideAddress?: string; // manual address, only used if the user opts out of "use my wallet address"
}
type ContactCardLocalState = Record<string /* coin key */, ContactCardCoinState>;
```

Stored in `localStorage` under `walletium-contactcard-local`. New coins that appear in `useSupportedChains()` but have no entry yet are implicitly `undecided` (no write needed until the user acts on them) - this is what drives the completeness banner.

The address actually used for a `published` coin is **never read from `overrideAddress` unless the user explicitly set one** - by default it's whatever `GET_USER_WALLET` reports for that coin right now (same call `CoinDetail.tsx` already makes via `walletRequestForChain`). This means simply holding a new address in the wallet doesn't silently publish anything - `decision` must be `published` first - but once it is, the published value always reflects the wallet's current address with no separate edit step.

---

## `src/utils/contactCardQDN.ts` (new, replaces `addressBookQDN.ts`)

Mirrors the structure of today's `addressBookQDN.ts` (same debounce pattern, same `ensureAccountUnlocked` helper, same 404-tolerant fetch) with three differences: single resource instead of one-per-coin, `DOCUMENT` instead of `DOCUMENT_PRIVATE` (no `ENCRYPT_DATA`/`DECRYPT_DATA` step needed - it's meant to be public), and **delete-then-republish** on every change instead of a plain overwrite.

```ts
export async function fetchContactCard(name: string): Promise<
  | { status: 'found'; data: ContactCardQDNData }
  | { status: 'not-found' }
  | { status: 'fetch-failed'; error: unknown }
>;

export async function publishContactCard(
  localState: ContactCardLocalState,
  userName: string
): Promise<{ publishedAt: number } | null>;

export const debouncedPublishContactCard: (
  localState: ContactCardLocalState,
  userName: string,
  delay?: number
) => void;
```

`publishContactCard` derives the `addresses` map from `localState` (resolving each `published` coin's current wallet address via `GET_USER_WALLET`, or `overrideAddress` if set), then:

1. `DELETE_QDN_RESOURCE` for `{ service: 'DOCUMENT', name, identifier: 'walletium-contactcard' }` - tolerate/ignore a "not found" failure (nothing to delete on first publish).
2. `PUBLISH_QDN_RESOURCE` with the fresh document.

Both are separate user-approval prompts and separate MemoryPoW computations (Qortium uses mempow, not fees, so there's no monetary cost to the two-step publish - just two approvals/two PoW computations instead of one). The existing debounce (2s, same as today) collapses rapid multi-coin toggling into a single delete+republish pair rather than one per click.

`fetchContactCard` reuses the same 404-tolerance pattern as today's `fetchFromQDN` (treat "resource not found" as `not-found`, not an error) and distinguishes it from a genuine network/node error (`fetch-failed`), since the caller (the resolver, below) needs to tell "this person has no card" apart from "couldn't check right now."

---

## `src/utils/resolveContact.ts` (new)

The single shared resolver both send-flow entry points call. No caching - every call is a fresh fetch, per the "always re-fetch, never resolve from cache" requirement.

```ts
export type ContactResolution =
  | { status: 'resolved'; address: string; coin: string; name: string }
  | { status: 'coin-not-published'; name: string; coin: string }
  | { status: 'no-card'; name: string }
  | { status: 'name-not-found'; name: string }
  | { status: 'fetch-failed'; name: string };

export async function resolveContact(
  name: string,
  coin: string
): Promise<ContactResolution>;
```

Implementation: runs `GET_NAME_DATA` (bridge action) and `fetchContactCard(name)` together. If the name doesn't resolve at all, `name-not-found` (most likely a typo - distinct messaging from "no card"). If the name is valid but the card fetch is `not-found`, `no-card`. If the card exists but `addresses[coin]` is missing, `coin-not-published`. If the card fetch itself errored (network/node), `fetch-failed` - callers must not treat this as equivalent to "not published," since that would let a transient failure silently steer someone toward the manual-paste path when the address might actually exist.

Also exports:

```ts
export function missingCoinsForCard(
  localState: ContactCardLocalState,
  chains: ChainConfig[]
): ChainConfig[]; // chains where decision is 'undecided'
```

used by the completeness banner (see below).

---

## "My Contact Card" screen (new, replaces the Address Book dialog)

New route, e.g. `src/components/ContactCard/MyContactCardDialog.tsx`, opened from wherever Address Book would have been wired in (TopBar - it currently has no entry point either, so this is a new nav item, not a rewire).

Layout: one row per chain from `useSupportedChains()`, in the same order `CoinGrid` shows them:

- Coin icon + name (reuse `useCoinImageUrl`)
- Current wallet address for that coin (read-only, fetched via the existing `walletRequestForChain` pattern), or a skeleton while loading
- A `Publish` / `Private` switch bound to `localState[coin].decision`
- An "Use a different address" expandable link revealing a manual `TextField` (sets `overrideAddress`); collapsed by default so the common path (auto address, just flip the switch) stays a one-tap action

At the top: the **completeness banner** (see below). At the bottom: sync status, mirroring today's `hasUnsyncedChanges` / `isSyncing` / snackbar pattern from `AddressBookDialog`, but simplified - there's no per-coin sync anymore, one publish covers the whole card.

Every toggle/override change updates `localState` immediately (`localStorage`) and calls `debouncedPublishContactCard`.

---

## Completeness / staleness banner

A coin counts as "needs a decision" only if its `localState[coin].decision === 'undecided'` - i.e. it has never been explicitly published or marked private. Checked against **every chain `useSupportedChains()` returns**, regardless of whether the user holds a balance in it (per the "every supported coin" decision), but explicit `private` choices never re-trigger the nudge - only genuinely new, never-seen coins do. This is what makes "tell me when new coins pop up" work without turning into permanent nagging for coins someone deliberately keeps unpublished.

Banner text: "3 coins not yet on your card: DGB, RVN, FIRO" with a way to jump straight to those rows. Also surfaced as a small badge wherever the entry point to "My Contact Card" lives (mirrors how `CoinGrid`/`TopBar` likely already surface other small counts, e.g. unread notifications).

---

## Send flow (two entry paths, one resolver)

### Path A - "Find a Person" (new screen/dialog)

New component, e.g. `src/components/ContactCard/FindPersonDialog.tsx`. A single name input (no autocomplete/fuzzy search - the Core API only exposes exact `GET /names/{name}` lookup, not a name-search endpoint, so this is deliberately a "type the exact name, submit" field, not a typeahead across the whole namespace). On submit, calls `resolveContact` once per known coin the user's wallet supports (parallel `Promise.all`, coin-not-published entries simply don't render) to build a list of "this person publishes: QORT, BTC, DOGE" - clicking one navigates into that coin's `CoinDetail` send flow with `?to=<address>&fromName=<name>` in the URL (same `useSearchParams` pattern `CoinDetail` already reads `to` from).

A small local-only MRU list (last N names successfully resolved, `localStorage`, no addresses cached - just names, to avoid the "resolve from cache" problem entirely) gives a personal shortcut list without needing a backend search capability.

### Path B - from inside a coin's send flow (`CoinDetail.tsx`)

The recipient field becomes a two-mode control - **"By Name" / "By Address" tabs**, both always available (this directly satisfies "always be able to just paste an address" - Address mode is not gated behind a failed name lookup, it's a first-class parallel option, identical to today's plain `TextField`).

In Name mode: a `TextField` for the Qortium name. On blur/submit (debounced), calls `resolveContact(name, chain.coinEnum)`:

- `resolved` -> shows "Sending to **{name}**'s {ticker} address: `{address}`" beneath the field; internally sets the existing `recipient` state to the resolved address so all downstream amount/fee/validation logic (`isValidRecipient`, `recipientIsValid`, etc.) needs zero changes.
- `coin-not-published` / `no-card` / `name-not-found` -> inline error explaining which case it is; no auto-fallback UI needed since Address mode is one tab click away.
- `fetch-failed` -> inline "couldn't check right now" with a retry button; explicitly does not suggest switching to Address mode (that's the user's call, not something a network hiccup should nudge them toward).

**Final safety net:** immediately before the actual send action fires (the existing confirm step backed by `PreparedTransactionPreview`), if the recipient was resolved via Name mode, `resolveContact` runs one more time. If the freshly resolved address differs from what's currently populating `recipient` (card changed mid-flow), the send is blocked, the field is updated to the new address, and the user must re-confirm - never silently send to the address that was current a minute ago. If this final check itself hits `fetch-failed`, the send is blocked with a retry prompt rather than proceeding on the earlier (now unverified) value.

---

## Removing the old Address Book

Delete outright (no live UI references them beyond their own tests, confirmed above):

- `src/components/AddressBook/` (all files)
- `src/utils/addressBookStorage.ts`, `src/utils/addressBookQDN.ts`
- `AddressBookEntry` from `src/utils/Types.tsx`
- `ADDRESSBOOK_*` constants from `src/common/constants.ts`
- The `syncAllAddressBooksOnStartup` call in `AppLayout.tsx` (replaced by an equivalent startup step that just ensures the local contact-card state is loaded - no QDN fetch needed on startup since resolution is always on-demand/fresh, not synced)
- All `address_book_*` i18n keys across every locale file

Old `DOCUMENT_PRIVATE` `walletium-addressbook-{coin}` QDN resources published by existing users are simply abandoned - no code reads them after this ships, and there's no fee-bearing reason to explicitly delete them (mempow, not fees, so leaving them costs nothing; deleting them would just be two more approval prompts for zero benefit).

---

## i18n

New keys under a `contact_card_*` namespace in `core.json` for every locale (mirrors the existing `address_book_*` set being removed): title, publish/private toggle labels, override-address expand link, completeness banner text, find-person screen strings, and the four resolution-failure messages (`no-card`, `coin-not-published`, `name-not-found`, `fetch-failed`).

---

## Testing

Following the existing test patterns (`addressBookQDN.test.ts`, `AddressBookDialog.test.tsx`, `AddressBook.integration.test.tsx`, `CoinDetail.send.test.tsx`):

- `contactCardQDN.test.ts` - delete-then-publish ordering, 404-tolerant fetch, `not-found` vs `fetch-failed` discrimination, debounce collapsing.
- `resolveContact.test.ts` - all five `ContactResolution` states, especially that `fetch-failed` is never conflated with `no-card`/`coin-not-published`.
- `MyContactCardDialog.test.tsx` - toggle -> debounced publish, override address path, completeness banner coin list, "undecided" vs "private" distinction (private never reappears in the banner).
- `FindPersonDialog.test.tsx` - multi-coin resolution list, MRU list persistence (names only, no addresses).
- `CoinDetail.send.test.tsx` additions - Name/Address tab switching, resolved-address display, all failure-state messaging, and the pre-send final-safety-net re-resolution (including the "card changed mid-flow" block-and-update case).
