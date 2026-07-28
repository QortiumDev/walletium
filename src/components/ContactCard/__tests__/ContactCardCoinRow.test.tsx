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

function renderRow(
  state: ContactCardCoinState = { decision: 'undecided' },
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
});
