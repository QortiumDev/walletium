import { Alert, Box, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ChainConfig } from '../../config/chains';

interface Props {
  missingChains: ChainConfig[];
}

export function ContactCardCompletenessBanner({ missingChains }: Props) {
  const { t } = useTranslation(['core']);

  if (missingChains.length === 0) return null;

  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      {t('core:contact_card_completeness_banner', {
        count: missingChains.length,
      })}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
        {missingChains.map((chain) => (
          <Chip key={chain.key} size="small" label={chain.ticker} />
        ))}
      </Box>
    </Alert>
  );
}
