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
  } catch (error) {
    console.warn('Contact Card: Error loading local state', error);
    return {};
  }
}

// Coins default to "published" - contact cards are public by default and the
// user opts individual coins out to "private", rather than opting each one in.
const DEFAULT_DECISION: ContactCardDecision = 'published';

export function getCoinState(coin: string): ContactCardCoinState {
  return getContactCardLocalState()[coin] ?? { decision: DEFAULT_DECISION };
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
  const current = state[coin] ?? { decision: DEFAULT_DECISION };
  return save({ ...state, [coin]: { ...current, decision } });
}

export function setCoinOverrideAddress(
  coin: string,
  overrideAddress: string | undefined
): ContactCardLocalState {
  const state = getContactCardLocalState();
  const current = state[coin] ?? { decision: DEFAULT_DECISION };
  const nextEntry: ContactCardCoinState = overrideAddress
    ? { decision: current.decision, overrideAddress }
    : { decision: current.decision };
  return save({ ...state, [coin]: nextEntry });
}
