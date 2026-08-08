import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeProviderWrapper from '../../../styles/theme/theme-provider';
import i18n from '../../../i18n/i18n';
import { MyContactCardPage } from '../MyContactCardPage';

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

const publishContactCard = vi.fn();
vi.mock('../../../utils/contactCardQDN', () => ({
  publishContactCard: (...args: unknown[]) => publishContactCard(...args),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
}

describe('MyContactCardPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    publishContactCard.mockReset();
    publishContactCard.mockResolvedValue({ publishedAt: 1 });
    (globalThis as any).qdnRequest = vi.fn(async () => ({
      address: 'addr',
      name: 'Alice',
    }));
  });

  async function findEnabledPublishButton() {
    const button = await screen.findByRole('button', { name: /^publish$/i });
    await waitFor(() => expect(button).toBeEnabled());
    return button;
  }

  afterEach(() => {
    delete (globalThis as any).qdnRequest;
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <ThemeProviderWrapper>
          <MyContactCardPage />
          <LocationProbe />
        </ThemeProviderWrapper>
      </MemoryRouter>
    );
  }

  it('renders one row per supported chain', () => {
    renderPage();
    const rows = within(screen.getByTestId('contact-card-rows'));
    expect(rows.getByText('BTC')).toBeInTheDocument();
    expect(rows.getByText('LTC')).toBeInTheDocument();
  });

  it('shows every coin switched on (included) by default', () => {
    renderPage();
    for (const sw of screen.getAllByRole('switch')) {
      expect(sw).toBeChecked();
    }
  });

  it('toggling a switch updates it locally without publishing anything', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole('switch')[0]);

    expect(screen.getAllByRole('switch')[0]).not.toBeChecked();
    expect(publishContactCard).not.toHaveBeenCalled();
  });

  it('publishing sends every chain in one call, including ones never touched', async () => {
    const user = userEvent.setup();
    renderPage();

    // Turn BTC private; LTC is left untouched and should still be sent as
    // "published" since coins are included by default.
    await user.click(screen.getAllByRole('switch')[0]);
    await user.click(await findEnabledPublishButton());

    expect(publishContactCard).toHaveBeenCalledWith(
      {
        BTC: { decision: 'private' },
        LTC: { decision: 'published' },
      },
      'Alice'
    );
    expect(await screen.findByText(/published to qdn/i)).toBeInTheDocument();
  });

  it('shows an error status when publishing fails', async () => {
    publishContactCard.mockResolvedValue(null);
    const user = userEvent.setup();
    renderPage();

    await user.click(await findEnabledPublishButton());

    expect(await screen.findByText(/publish failed/i)).toBeInTheDocument();
  });

  it('enables the publish button once GET_SELECTED_ACCOUNT resolves a name', async () => {
    renderPage();

    expect(screen.getByRole('button', { name: /^publish$/i })).toBeDisabled();
    expect(await findEnabledPublishButton()).toBeEnabled();
  });

  it('publishes using the account name even without a primary name set', async () => {
    // Mirrors GET_SELECTED_ACCOUNT falling back to the account's first owned
    // name when no primary name is set - the case that left the button
    // permanently disabled when this page read the name via qapp-core's
    // useGlobal()/GET_PRIMARY_NAME instead.
    (globalThis as any).qdnRequest = vi.fn(async () => ({
      address: 'addr',
      name: 'SecondaryName',
    }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await findEnabledPublishButton());

    expect(publishContactCard).toHaveBeenCalledWith(
      expect.anything(),
      'SecondaryName'
    );
  });

  it('navigates to the find-a-person page when the button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /find a person/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/contacts/find');
  });
});
