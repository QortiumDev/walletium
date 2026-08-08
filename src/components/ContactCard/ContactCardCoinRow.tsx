import { useEffect, useState } from 'react';
import { Box, Button, FormControlLabel, Switch, TextField } from '@mui/material';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { ChainConfig } from '../../config/chains';
import type { ContactCardCoinState } from '../../utils/Types';
import { EMPTY_STRING } from '../../common/constants';
import { uiStyleAtom } from '../../state/global/system';
import { useColors } from '../../theme/ColorTokensContext';
import { tokens } from '../../theme/tokens';
import { useCoinImageUrl } from '../../hooks/useCoinImageUrl';

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
  const c = useColors();
  const isClassic = useAtomValue(uiStyleAtom) === 'classic';
  const coinImageUrl = useCoinImageUrl(chain.ticker);
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
    <Box
      sx={{
        border: `${
          isClassic ? tokens.shape.classicBorderWidth : tokens.shape.borderWidth
        } solid ${isClassic ? c.border : c.borderLight}`,
        borderRadius: `${isClassic ? tokens.shape.radiusMd : tokens.shape.radius}px`,
        bgcolor: c.surface,
        boxShadow: c.shadowCard,
        px: { xs: 1, sm: 1.5 },
        py: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 1.5 } }}>
        {coinImageUrl ? (
          <Box
            component="img"
            src={coinImageUrl}
            alt=""
            sx={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
          />
        ) : (
          <Box
            aria-hidden="true"
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: c.controlHover,
              color: c.textSecondary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: tokens.typography.weightBold,
              flexShrink: 0,
            }}
          >
            {chain.ticker[0]}
          </Box>
        )}

        <Box sx={{ minWidth: 0, flex: '1 1 180px' }}>
          <Box
            sx={{
              color: c.textPrimary,
              fontWeight: tokens.typography.weightBold,
              fontSize: '0.9rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {chain.name}
          </Box>
          <Box
            sx={{
              color: c.textSecondary,
              fontSize: '0.65rem',
              fontWeight: tokens.typography.weightBold,
              letterSpacing: '0.12em',
              mt: 0.25,
            }}
          >
            {chain.ticker}
          </Box>
          <Box
            sx={{
              color: c.textSecondary,
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              mt: 0.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayedAddress ?? t('core:contact_card_address_loading')}
          </Box>
        </Box>

        <FormControlLabel
          sx={{ mr: 0, flexShrink: 0 }}
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
            <Box
              sx={{
                fontSize: '0.65rem',
                fontWeight: tokens.typography.weightBold,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: published ? c.accent : c.textSecondary,
              }}
            >
              {published
                ? t('core:contact_card_switch_publish')
                : t('core:contact_card_private')}
            </Box>
          }
        />
      </Box>

      <Box sx={{ mt: 0.5 }}>
        <Button
          size="small"
          onClick={() => setOverrideOpen((v) => !v)}
          sx={{ fontSize: '0.7rem', px: 0.5, minWidth: 0 }}
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
            sx={{ mt: 0.5 }}
          />
        )}
      </Box>
    </Box>
  );
}
