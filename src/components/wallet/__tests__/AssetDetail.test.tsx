import { MemoryRouter } from 'react-router-dom';
import { Provider, createStore } from 'jotai';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ThemeProviderWrapper from '../../../styles/theme/theme-provider';
import i18n from '../../../i18n/i18n';
import { walletReadyAtom } from '../../../state/global/system';
import { AssetDetail } from '../AssetDetail';

vi.mock('react-qr-code', () => ({ default: () => null }));

function renderDetail(store: ReturnType<typeof createStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ThemeProviderWrapper>
          <AssetDetail assetId={42} />
        </ThemeProviderWrapper>
      </MemoryRouter>
    </Provider>
  );
}

describe('AssetDetail asset reads', () => {
  let qdnRequestMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');

    qdnRequestMock = vi.fn(async (opts: Record<string, unknown>) => {
      switch (opts.action) {
        case 'GET_ASSET_INFO':
          expect(opts).toMatchObject({ assetId: 42 });
          return {
            assetId: 42,
            owner: 'Qissuer',
            name: 'GOLD',
            quantity: '1000000000000',
            isDivisible: true,
            isUnspendable: false,
            creationGroupId: 0,
            isOwnerForSale: false,
          };
        case 'GET_USER_WALLET':
          return { address: 'Qholder' };
        case 'GET_ASSET_BALANCES':
          expect(opts).toMatchObject({
            address: 'Qholder',
            assetId: 42,
            limit: 0,
          });
          return [{ address: 'Qholder', assetId: 42, balance: '500000000' }];
        case 'GET_ASSET_TRANSFERS':
          expect(opts).toMatchObject({
            assetId: 42,
            address: 'Qholder',
            limit: 20,
            reverse: true,
          });
          return [];
        case 'SHOW_ACTIONS':
          return ['TRANSFER_ASSET'];
        default:
          return null;
      }
    });

    (globalThis as any).qdnRequest = qdnRequestMock;
  });

  it('loads asset info, balance, and transfers via the named actions, not FETCH_NODE_API', async () => {
    const store = createStore();
    store.set(walletReadyAtom, true);
    renderDetail(store);

    await waitFor(() => expect(screen.getByText('GOLD')).toBeInTheDocument());
    await waitFor(() =>
      expect(
        qdnRequestMock.mock.calls.some(
          ([opts]) => opts.action === 'GET_ASSET_BALANCES'
        )
      ).toBe(true)
    );

    expect(
      qdnRequestMock.mock.calls.some(
        ([opts]) => opts.action === 'FETCH_NODE_API'
      )
    ).toBe(false);
  });
});
