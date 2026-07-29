import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
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
    debouncedPublishContactCard.mockClear();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ address: 'addr' }));
  });

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

  it('navigates to the find-a-person page when the button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /find a person/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/contacts/find');
  });
});
