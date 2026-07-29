import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ChainConfig } from '../../config/chains';
import type { ContactCardCoinState } from '../../utils/Types';
import { EMPTY_STRING } from '../../common/constants';

interface Props {
  chain: ChainConfig;
  state: ContactCardCoinState;
  onDecisionChange: (coin: string, decision: 'published' | 'private') => void;
  onOverrideChange: (coin: string, address: string | undefined) => void;
}

function walletRequestForChain(chain: ChainConfig): QdnRequestOptions {
  return chain.isNative
    ? { action: 'GET_USER_WALLET', assetId: 0 }
    : { action: 'GET_USER_WALLET', coin: chain.coinEnum };
}

export function ContactCardCoinRow({
  chain,
  state,
  onDecisionChange,
  onOverrideChange,
}: Props) {
  const { t } = useTranslation(['core']);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  // derived from props at mount only; assumes state only changes via our own
  // callbacks (onDecisionChange/onOverrideChange) - if a parent ever mutates
  // state.overrideAddress independently of those callbacks (e.g. resetting
  // the form, or reusing this component instance for a different chain
  // without changing its key), this will go stale and needs a resync effect.
  const [overrideOpen, setOverrideOpen] = useState(!!state.overrideAddress);
  const [overrideValue, setOverrideValue] = useState(
    state.overrideAddress ?? EMPTY_STRING
  );

  useEffect(() => {
    let cancelled = false;
    qdnRequest(walletRequestForChain(chain))
      .then((res) => {
        if (!cancelled) setWalletAddress(res?.address ?? null);
      })
      .catch(() => {
        if (!cancelled) setWalletAddress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chain]);

  const published = state.decision === 'published';
  const displayedAddress = state.overrideAddress || walletAddress;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ minWidth: 64, fontWeight: 700 }}>
          {chain.ticker}
        </Typography>
        <Typography
          sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}
          noWrap
        >
          {displayedAddress ?? t('core:contact_card_address_loading')}
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={published}
              onChange={(e) =>
                onDecisionChange(
                  chain.key,
                  e.target.checked ? 'published' : 'private'
                )
              }
            />
          }
          label={
            published
              ? t('core:contact_card_published')
              : t('core:contact_card_private')
          }
        />
      </Box>
      <Button
        size="small"
        onClick={() => setOverrideOpen((v) => !v)}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('core:contact_card_use_different_address')}
      </Button>
      {overrideOpen && (
        <TextField
          size="small"
          fullWidth
          label={t('core:contact_card_override_address_label')}
          value={overrideValue}
          onChange={(e) => {
            const value = e.target.value.trim();
            setOverrideValue(value);
            onOverrideChange(chain.key, value || undefined);
          }}
        />
      )}
    </Box>
  );
}
