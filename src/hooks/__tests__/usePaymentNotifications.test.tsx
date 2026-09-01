import { Provider, createStore } from 'jotai';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notificationsEnabledAtom,
  paymentNotificationRegistrationErrorAtom,
  paymentNotificationRegistrationStatusAtom,
  walletReadyAtom,
} from '../../state/global/system';
import { usePaymentNotifications } from '../usePaymentNotifications';

const mocks = vi.hoisted(() => ({
  registerPaymentNotifications: vi.fn(),
  removeNotificationRules: vi.fn(),
  supportsNotifications: vi.fn(),
}));

const supportedChains = [
  { key: 'QORT', coinEnum: 'QORT', isNative: true },
  {
    key: 'BTC',
    coinEnum: 'BTC',
    isNative: false,
    homeWallet: {
      contract: 'qortium-home-wallet-v1',
      implemented: true,
      protocol: 'qdnRequest',
      read: true,
      receive: true,
      requiresUnlockedAccount: true,
      send: true,
      sendMode: 'TRUSTED_CORE',
    },
  },
  { key: 'ARRR', coinEnum: 'ARRR', isNative: false },
];

vi.mock('../../notifications/notificationsApi', () => ({
  removeNotificationRules: mocks.removeNotificationRules,
  supportsNotifications: mocks.supportsNotifications,
}));

vi.mock('../../notifications/paymentNotificationRegistration', () => ({
  paymentNotificationErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : 'Registration failed',
  registerPaymentNotifications: mocks.registerPaymentNotifications,
}));

vi.mock('../useSupportedChains', () => ({
  useSupportedChains: () => ({
    chains: supportedChains,
    status: 'live',
  }),
}));

function Harness() {
  usePaymentNotifications();
  return null;
}

describe('usePaymentNotifications', () => {
  beforeEach(() => {
    mocks.registerPaymentNotifications.mockReset();
    mocks.removeNotificationRules.mockReset().mockResolvedValue(undefined);
    mocks.supportsNotifications.mockReset().mockResolvedValue(true);
    (globalThis as any).qdnRequest = vi.fn(async (options: any) =>
      options.action === 'SHOW_ACTIONS' ? ['GET_USER_WALLET'] : null
    );
  });

  afterEach(() => {
    delete (globalThis as any).qdnRequest;
  });

  it('registers through the selected-account flow when the bell is enabled', async () => {
    mocks.registerPaymentNotifications.mockResolvedValue({
      ruleCount: 2,
      signature: 'selected-account-signature',
    });
    const store = createStore();
    store.set(walletReadyAtom, true);
    store.set(notificationsEnabledAtom, true);

    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );

    await waitFor(() =>
      expect(mocks.registerPaymentNotifications).toHaveBeenCalledWith(['BTC'])
    );
    await waitFor(() =>
      expect(store.get(paymentNotificationRegistrationStatusAtom)).toBe(
        'registered'
      )
    );
  });

  it('turns the bell back off and exposes a registration error', async () => {
    mocks.registerPaymentNotifications.mockRejectedValue(
      new Error('Home rejected the notification request')
    );
    const store = createStore();
    store.set(walletReadyAtom, true);
    store.set(notificationsEnabledAtom, true);

    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );

    await waitFor(() =>
      expect(store.get(notificationsEnabledAtom)).toBe(false)
    );
    expect(store.get(paymentNotificationRegistrationStatusAtom)).toBe('error');
    expect(store.get(paymentNotificationRegistrationErrorAtom)).toBe(
      'Home rejected the notification request'
    );
  });

  it('removes persisted rules when disabled from a fresh locked mount', async () => {
    mocks.registerPaymentNotifications.mockReturnValue(new Promise(() => {}));
    const store = createStore();
    store.set(notificationsEnabledAtom, true);

    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );

    act(() => store.set(notificationsEnabledAtom, false));

    await waitFor(() =>
      expect(mocks.removeNotificationRules).toHaveBeenCalledTimes(1)
    );
    expect(mocks.registerPaymentNotifications).not.toHaveBeenCalled();
    expect(store.get(paymentNotificationRegistrationStatusAtom)).toBe('idle');
  });
});
