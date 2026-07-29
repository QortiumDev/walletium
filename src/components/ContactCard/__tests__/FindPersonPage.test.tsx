import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeProviderWrapper from '../../../styles/theme/theme-provider';
import i18n from '../../../i18n/i18n';
import { FindPersonPage } from '../FindPersonPage';
import * as contactCardQDN from '../../../utils/contactCardQDN';

vi.mock('../../../utils/contactCardQDN');

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

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProviderWrapper>
        <FindPersonPage />
        <LocationProbe />
      </ThemeProviderWrapper>
    </MemoryRouter>
  );
}

describe('FindPersonPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as any).qdnRequest;
    vi.clearAllMocks();
  });

  it('shows only the coins the found person has published', async () => {
    const user = userEvent.setup();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-addr' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'found',
      data: { version: 1, lastUpdated: 1, addresses: { BTC: 'bc1qalice' } },
    });

    renderPage();
    await user.type(screen.getByLabelText(/qortium name/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText('BTC')).toBeInTheDocument();
    expect(screen.queryByText('LTC')).not.toBeInTheDocument();
  });

  it('shows a name-not-found message when the name does not resolve', async () => {
    const user = userEvent.setup();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ owner: null }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    renderPage();
    await user.type(screen.getByLabelText(/qortium name/i), 'Nobody');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(
      await screen.findByText(/no qortium name found matching "Nobody"/i)
    ).toBeInTheDocument();
  });

  it('shows a no-card message when the name exists but has no card', async () => {
    const user = userEvent.setup();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-addr' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'not-found',
    });

    renderPage();
    await user.type(screen.getByLabelText(/qortium name/i), 'Bob');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(
      await screen.findByText(/bob doesn't have a contact card yet/i)
    ).toBeInTheDocument();
  });

  it('adds a successfully found name to the recent list on the next render', async () => {
    const user = userEvent.setup();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-addr' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'found',
      data: { version: 1, lastUpdated: 1, addresses: { BTC: 'bc1qalice' } },
    });

    renderPage();
    await user.type(screen.getByLabelText(/qortium name/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('BTC');

    expect(
      JSON.parse(localStorage.getItem('walletium-contact-mru') ?? '[]')
    ).toEqual(['Alice']);
  });

  it('navigates to the coin send flow with send=true when a resolved coin is clicked', async () => {
    const user = userEvent.setup();
    (globalThis as any).qdnRequest = vi.fn(async () => ({ owner: 'Q-addr' }));
    vi.mocked(contactCardQDN.fetchContactCard).mockResolvedValue({
      status: 'found',
      data: { version: 1, lastUpdated: 1, addresses: { BTC: 'bc1qalice' } },
    });

    renderPage();
    await user.type(screen.getByLabelText(/qortium name/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    await user.click(await screen.findByRole('button', { name: 'BTC' }));

    const location = screen.getByTestId('location').textContent ?? '';
    expect(location.startsWith('/bitcoin?')).toBe(true);
    const params = new URLSearchParams(location.slice('/bitcoin?'.length));
    expect(params.get('send')).toBe('true');
    expect(params.get('to')).toBe('bc1qalice');
    expect(params.get('fromName')).toBe('Alice');
  });
});
