import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSupportedChains } from '../useSupportedChains';

describe('useSupportedChains bridge availability', () => {
  beforeEach(() => {
    sessionStorage.clear();
    delete (globalThis as any).qdnRequest;
  });

  afterEach(() => {
    sessionStorage.clear();
    delete (globalThis as any).qdnRequest;
    vi.restoreAllMocks();
  });

  it('shows only QORT when hosted without qdnRequest', async () => {
    const { result } = renderHook(() => useSupportedChains());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.chains.map((chain) => chain.key)).toEqual(['QORT']);
  });
});
