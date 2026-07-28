import { useState } from 'react';
import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSupportedChains } from '../../hooks/useSupportedChains';
import { fetchContactCard } from '../../utils/contactCardQDN';
import {
  addRecentContactName,
  getRecentContactNames,
} from '../../utils/contactMru';
import { EMPTY_STRING } from '../../common/constants';
import type { ChainConfig } from '../../config/chains';

type SearchError = 'name-not-found' | 'no-card' | 'fetch-failed';

export function FindPersonPage() {
  const { t } = useTranslation(['core']);
  const navigate = useNavigate();
  const { chains } = useSupportedChains();

  const [name, setName] = useState(EMPTY_STRING);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string> | null>(
    null
  );
  const [resolvedName, setResolvedName] = useState(EMPTY_STRING);
  const [recent, setRecent] = useState(() => getRecentContactNames());

  async function handleSearch() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSearching(true);
    setError(null);
    setAddresses(null);

    try {
      const nameData = await qdnRequest({
        action: 'GET_NAME_DATA',
        name: trimmedName,
      }).catch(() => null);

      if (!(nameData as { owner?: string } | null)?.owner) {
        setError('name-not-found');
        return;
      }

      const cardResult = await fetchContactCard(trimmedName);
      if (cardResult.status === 'not-found') {
        setError('no-card');
        return;
      }
      if (cardResult.status === 'fetch-failed') {
        setError('fetch-failed');
        return;
      }

      setResolvedName(trimmedName);
      setAddresses(cardResult.data.addresses);
      setRecent(addRecentContactName(trimmedName));
    } finally {
      setSearching(false);
    }
  }

  const matchingChains: ChainConfig[] = addresses
    ? chains.filter((chain) => addresses[chain.key])
    : [];

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', p: 3 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('core:contact_card_find_person_title')}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          label={t('core:contact_card_search_label')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={searching}
        />
        <Button
          variant="contained"
          onClick={handleSearch}
          disabled={searching || !name.trim()}
        >
          {t('core:contact_card_search_button')}
        </Button>
      </Box>

      {recent.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ width: '100%' }}>
            {t('core:contact_card_search_recent')}
          </Typography>
          {recent.map((recentName) => (
            <Chip
              key={recentName}
              size="small"
              label={recentName}
              onClick={() => setName(recentName)}
            />
          ))}
        </Box>
      )}

      {error && (
        <Typography color="error">
          {t(`core:contact_card_search_error_${error.replace(/-/g, '_')}`, {
            name: name.trim(),
          })}
        </Typography>
      )}

      {addresses && (
        <>
          <Typography sx={{ mb: 1 }}>
            {t('core:contact_card_search_result_intro', {
              name: resolvedName,
            })}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {matchingChains.map((chain) => (
              <Button
                key={chain.key}
                variant="outlined"
                onClick={() =>
                  navigate(
                    `/${chain.route}?to=${encodeURIComponent(
                      addresses[chain.key]
                    )}&fromName=${encodeURIComponent(resolvedName)}`
                  )
                }
              >
                {chain.ticker}
              </Button>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
