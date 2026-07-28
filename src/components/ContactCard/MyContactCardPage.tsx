import { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useGlobal } from 'qapp-core';
import { useSupportedChains } from '../../hooks/useSupportedChains';
import {
  getContactCardLocalState,
  setCoinDecision,
  setCoinOverrideAddress,
} from '../../utils/contactCardStorage';
import { debouncedPublishContactCard } from '../../utils/contactCardQDN';
import { missingCoinsForCard } from '../../utils/resolveContact';
import type { ContactCardLocalState } from '../../utils/Types';
import { ContactCardCoinRow } from './ContactCardCoinRow';
import { ContactCardCompletenessBanner } from './ContactCardCompletenessBanner';

export function MyContactCardPage() {
  const { t } = useTranslation(['core']);
  const { chains } = useSupportedChains();
  const userName = useGlobal().auth.name as string | undefined;
  const [localState, setLocalState] = useState<ContactCardLocalState>(() =>
    getContactCardLocalState()
  );

  const missingChains = useMemo(
    () => missingCoinsForCard(localState, chains),
    [localState, chains]
  );

  const handleDecisionChange = (
    coin: string,
    decision: 'published' | 'private'
  ) => {
    const next = setCoinDecision(coin, decision);
    setLocalState(next);
    if (userName) debouncedPublishContactCard(next, userName);
  };

  const handleOverrideChange = (coin: string, address: string | undefined) => {
    const next = setCoinOverrideAddress(coin, address);
    setLocalState(next);
    if (userName) debouncedPublishContactCard(next, userName);
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: 3 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('core:contact_card_my_card_title')}
      </Typography>
      <ContactCardCompletenessBanner missingChains={missingChains} />
      <Box data-testid="contact-card-rows">
        {chains.map((chain) => (
          <ContactCardCoinRow
            key={chain.key}
            chain={chain}
            state={localState[chain.key] ?? { decision: 'undecided' }}
            onDecisionChange={handleDecisionChange}
            onOverrideChange={handleOverrideChange}
          />
        ))}
      </Box>
    </Box>
  );
}
