import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThemeProviderWrapper from '../../../styles/theme/theme-provider';
import i18n from '../../../i18n/i18n';
import { ContactCardCompletenessBanner } from '../ContactCardCompletenessBanner';
import type { ChainConfig } from '../../../config/chains';

const chain = (key: string): ChainConfig => ({
  key,
  name: key,
  ticker: key,
  coinEnum: key,
  route: key.toLowerCase(),
  defaultFee: 0.001,
  isNative: false,
  decimalPlaces: 8,
  activeNetwork: 'MAIN',
  supportsHtlc: true,
  supportsLocalChainTrades: true,
});

describe('ContactCardCompletenessBanner', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders nothing when there are no missing coins', () => {
    const { container } = render(
      <ThemeProviderWrapper>
        <ContactCardCompletenessBanner missingChains={[]} />
      </ThemeProviderWrapper>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and a chip per missing coin', () => {
    render(
      <ThemeProviderWrapper>
        <ContactCardCompletenessBanner
          missingChains={[chain('DGB'), chain('RVN')]}
        />
      </ThemeProviderWrapper>
    );
    expect(screen.getByText(/2 coin/i)).toBeInTheDocument();
    expect(screen.getByText('DGB')).toBeInTheDocument();
    expect(screen.getByText('RVN')).toBeInTheDocument();
  });
});
