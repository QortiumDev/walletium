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

  it('setCoinOverrideAddress on a coin with no prior setCoinDecision defaults to "undecided"', () => {
    const next = setCoinOverrideAddress('BTC', 'bc1qcoldstorageaddress');
    expect(next.BTC).toEqual({
      decision: 'undecided',
      overrideAddress: 'bc1qcoldstorageaddress',
    });
    expect(getCoinState('BTC')).toEqual({
      decision: 'undecided',
      overrideAddress: 'bc1qcoldstorageaddress',
    });
  });

  it('survives malformed JSON in localStorage by returning an empty state', () => {
    localStorage.setItem('walletium-contactcard-local', 'not json');
    expect(getContactCardLocalState()).toEqual({});
  });
});
