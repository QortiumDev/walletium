import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeProviderWrapper from '../../../styles/theme/theme-provider';
import i18n from '../../../i18n/i18n';
import { ContactCardCoinRow } from '../ContactCardCoinRow';
import type { ChainConfig } from '../../../config/chains';
import type { ContactCardCoinState } from '../../../utils/Types';

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

const QORT_CHAIN: ChainConfig = {
  key: 'QORT',
  name: 'Qortal',
  ticker: 'QORT',
  coinEnum: 'QORT',
  route: 'qort',
  defaultFee: 0.001,
  isNative: true,
  decimalPlaces: 8,
  activeNetwork: 'MAIN',
  supportsHtlc: false,
  supportsLocalChainTrades: false,
};

function renderRow(
  state: ContactCardCoinState = { decision: 'undecided' },
  onDecisionChange = vi.fn(),
  onOverrideChange = vi.fn(),
  chain = BTC_CHAIN
) {
  render(
    <ThemeProviderWrapper>
      <ContactCardCoinRow
        chain={chain}
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
    (globalThis as any).qortalRequest = vi.fn(async () => ({
      address: 'QortWalletAddress',
    }));
  });

  afterEach(() => {
    delete (globalThis as any).qdnRequest;
    delete (globalThis as any).qortalRequest;
  });

  it('fetches and displays the wallet address for the coin', async () => {
    renderRow();
    expect(await screen.findByText('bc1qmywalletaddress')).toBeInTheDocument();
  });

  it('fetches the QORT address through qortalRequest', async () => {
    renderRow({ decision: 'published' }, vi.fn(), vi.fn(), QORT_CHAIN);

    expect(await screen.findByText('QortWalletAddress')).toBeInTheDocument();
    expect(globalThis.qortalRequest).toHaveBeenCalledWith({
      action: 'GET_USER_ACCOUNT',
    });
    expect(
      (globalThis.qdnRequest as ReturnType<typeof vi.fn>).mock.calls.some(
        ([request]) => request.action === 'GET_USER_WALLET'
      )
    ).toBe(false);
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
      expect(onOverrideChange).toHaveBeenLastCalledWith(
        'BTC',
        'bc1qcoldstorage'
      )
    );
  });

  it('pre-opens the override field and shows the override value when one is already set', () => {
    renderRow({ decision: 'published', overrideAddress: 'bc1qcoldstorage' });
    expect(screen.getByDisplayValue('bc1qcoldstorage')).toBeInTheDocument();
  });

  it('displays the override address, not the fetched wallet address, in the address line', async () => {
    renderRow({ decision: 'published', overrideAddress: 'bc1qcoldstorage' });

    // The override address must win over whatever GET_USER_WALLET returns.
    expect(await screen.findByText('bc1qcoldstorage')).toBeInTheDocument();
    expect(screen.queryByText('bc1qmywalletaddress')).not.toBeInTheDocument();
  });

  it('still renders the loading placeholder instead of crashing when qdnRequest rejects', async () => {
    (globalThis as any).qdnRequest = vi.fn(async () => {
      throw new Error('user rejected wallet request');
    });

    renderRow();

    expect(await screen.findByText('loading address…')).toBeInTheDocument();
  });
});
