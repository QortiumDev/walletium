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
