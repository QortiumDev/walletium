import { useEffect, useMemo, useState } from 'react';
import { Box, Button, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { useSupportedChains } from '../../hooks/useSupportedChains';
import { uiStyleAtom } from '../../state/global/system';
import { useColors } from '../../theme/ColorTokensContext';
import { tokens } from '../../theme/tokens';
import {
  getContactCardLocalState,
  setCoinDecision,
  setCoinOverrideAddress,
} from '../../utils/contactCardStorage';
import { publishContactCard } from '../../utils/contactCardQDN';
import type { ContactCardLocalState } from '../../utils/Types';
import { ContactCardCoinRow } from './ContactCardCoinRow';

type PublishStatus = 'saving' | 'published' | 'error';

export function MyContactCardPage() {
  const { t } = useTranslation(['core']);
  const navigate = useNavigate();
  const c = useColors();
  const uiStyle = useAtomValue(uiStyleAtom);
  const isClassic = uiStyle === 'classic';
  const { chains } = useSupportedChains();
  const [userName, setUserName] = useState<string | null>(null);
  const [localState, setLocalState] = useState<ContactCardLocalState>(() =>
    getContactCardLocalState()
  );
  const [publishStatus, setPublishStatus] = useState<PublishStatus | null>(
    null
  );

  // qapp-core's useGlobal()/useAuth() resolve the name via GET_PRIMARY_NAME
  // through qortalRequest, which Qortium Home doesn't provide (Qortium only
  // exposes qdnRequest, and GET_PRIMARY_NAME isn't one of its actions), so
  // that name is always empty here. GET_SELECTED_ACCOUNT is the Qortium-native
  // equivalent and already falls back from primary name to the account's
  // first owned name, so a user without a primary name can still publish.
  useEffect(() => {
    let cancelled = false;
    qdnRequest({ action: 'GET_SELECTED_ACCOUNT' })
      .then((res: { name?: string | null } | null) => {
        if (!cancelled) setUserName(res?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setUserName(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Coins are included by default (see contactCardStorage's DEFAULT_DECISION),
  // so untouched chains need an explicit entry here too - otherwise they'd
  // show as switched on in the UI but be silently left out of what actually
  // gets sent to publishContactCard, which only reads localState.
  const effectiveState = useMemo(() => {
    const merged: ContactCardLocalState = {};
    for (const chain of chains) {
      merged[chain.key] = localState[chain.key] ?? { decision: 'published' };
    }
    return merged;
  }, [localState, chains]);

  const handleDecisionChange = (
    coin: string,
    decision: 'published' | 'private'
  ) => {
    setLocalState(setCoinDecision(coin, decision));
  };

  const handleOverrideChange = (coin: string, address: string | undefined) => {
    setLocalState(setCoinOverrideAddress(coin, address));
  };

  const handlePublish = async () => {
    if (!userName || publishStatus === 'saving') return;
    setPublishStatus('saving');
    const result = await publishContactCard(effectiveState, userName);
    setPublishStatus(result ? 'published' : 'error');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: isClassic ? c.frameBg : c.bg }}>
      <Box
        sx={{
          position: 'sticky',
          top: `var(--wallet-top-bar-height, ${tokens.spacing.topBarHeight}px)`,
          zIndex: 90,
          bgcolor: c.surface,
          borderBottom: `${
            isClassic
              ? tokens.shape.classicBorderWidth
              : tokens.shape.borderWidth
          } solid ${isClassic ? c.border : c.borderLight}`,
          boxShadow: isClassic ? c.topBarShadow : 'none',
          display: 'flex',
          alignItems: 'center',
          px: { xs: isClassic ? 1.5 : 3, sm: 3 },
          py: isClassic ? 1 : 0,
          minHeight: tokens.spacing.topBarHeight,
          gap: 2,
        }}
      >
        <IconButton
          onClick={() => navigate('/')}
          size="small"
          sx={{ borderRadius: 0, color: c.textPrimary }}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box
          sx={{
            fontWeight: tokens.typography.weightBold,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontSize: '0.85rem',
          }}
        >
          {t('core:contact_card_my_card_title')}
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        {publishStatus && (
          <Box
            sx={{
              fontSize: '0.75rem',
              color: publishStatus === 'error' ? c.error : c.textSecondary,
            }}
          >
            {t(`core:contact_card_status_${publishStatus}`)}
          </Box>
        )}
        <Button
          size="small"
          variant="contained"
          disabled={!userName || publishStatus === 'saving'}
          onClick={handlePublish}
        >
          {t('core:contact_card_publish_button')}
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => navigate('/contacts/find')}
        >
          {t('core:contact_card_find_person_title')}
        </Button>
      </Box>
      <Box sx={{ maxWidth: 720, mx: 'auto', p: 3 }}>
        <Box
          sx={{
            mb: 2,
            px: 2.5,
            py: 1.5,
            fontSize: '0.78rem',
            color: c.textSecondary,
            border: `${
              isClassic
                ? tokens.shape.classicBorderWidth
                : tokens.shape.borderWidth
            } solid ${isClassic ? c.border : c.borderLight}`,
            borderRadius: `${isClassic ? tokens.shape.radiusMd : tokens.shape.radius}px`,
            bgcolor: c.surface,
          }}
        >
          {t('core:contact_card_publish_explainer')}
        </Box>
        <Box
          data-testid="contact-card-rows"
          sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
        >
          {chains.map((chain) => (
            <ContactCardCoinRow
              key={chain.key}
              chain={chain}
              state={effectiveState[chain.key]}
              onDecisionChange={handleDecisionChange}
              onOverrideChange={handleOverrideChange}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
