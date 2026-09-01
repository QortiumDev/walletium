import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { useAtomValue } from 'jotai';
import { uiStyleAtom } from '../../state/global/system';
import { useColors } from '../../theme/ColorTokensContext';
import { tokens } from '../../theme/tokens';
import type { PinAssetResult } from '../../hooks/useAssetHoldings';
import type {
  AssetNetwork,
  AssetSelector,
  NetworkAssetSelector,
} from '../../utils/Types';

interface AddAssetTriggerProps {
  onClick: () => void;
}

export function AddAssetTile({ onClick }: AddAssetTriggerProps) {
  const c = useColors();
  return (
    <Box
      onClick={onClick}
      role="button"
      aria-label="Add asset"
      sx={{
        aspectRatio: '1 / 1',
        border: `${tokens.shape.borderWidth} dashed ${c.borderLight}`,
        borderRadius: `${tokens.shape.radius}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        cursor: 'pointer',
        color: c.textSecondary,
        transition: 'border-color 0.15s ease, color 0.15s ease',
        '&:hover': { borderColor: c.accent, color: c.accent },
      }}
    >
      <AddIcon />
      <Box
        sx={{
          fontSize: '0.65rem',
          fontWeight: tokens.typography.weightBold,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Add Asset
      </Box>
    </Box>
  );
}

export function AddAssetRow({ onClick }: AddAssetTriggerProps) {
  const c = useColors();
  return (
    <Box
      onClick={onClick}
      role="button"
      aria-label="Add asset"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        minHeight: 72,
        border: `${tokens.shape.borderWidth} dashed ${c.borderLight}`,
        borderRadius: `${tokens.shape.radius}px`,
        cursor: 'pointer',
        color: c.textSecondary,
        transition: 'border-color 0.15s ease, color 0.15s ease',
        '&:hover': { borderColor: c.accent, color: c.accent },
      }}
    >
      <AddIcon fontSize="small" />
      <Box
        sx={{
          fontSize: '0.75rem',
          fontWeight: tokens.typography.weightBold,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Add Asset
      </Box>
    </Box>
  );
}

interface AddAssetDialogProps {
  open: boolean;
  onClose: () => void;
  networks: AssetNetwork[];
  onSubmit: (selector: NetworkAssetSelector) => Promise<PinAssetResult>;
}

export function AddAssetDialog({
  open,
  onClose,
  networks,
  onSubmit,
}: AddAssetDialogProps) {
  const c = useColors();
  const isClassic = useAtomValue(uiStyleAtom) === 'classic';
  const [assetInput, setAssetInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<AssetNetwork>(
    networks[0] ?? 'qortium'
  );

  useEffect(() => {
    if (!networks.includes(network) && networks[0]) setNetwork(networks[0]);
  }, [network, networks]);

  const handleClose = () => {
    if (submitting) return;
    setAssetInput('');
    setError(null);
    onClose();
  };

  const handleAdd = async () => {
    const trimmed = assetInput.trim();
    if (!trimmed) {
      setError('Enter an asset ID or name.');
      return;
    }
    const selector: AssetSelector = /^\d+$/.test(trimmed)
      ? { assetId: Number(trimmed) }
      : { assetName: trimmed };
    setSubmitting(true);
    setError(null);
    const result = await onSubmit({ ...selector, network });
    setSubmitting(false);
    if (result.ok) {
      setAssetInput('');
      onClose();
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          maxWidth: isClassic ? c.layoutMaxWidth : undefined,
          border: `${
            isClassic
              ? tokens.shape.classicBorderWidth
              : tokens.shape.borderWidth
          } solid ${isClassic ? c.border : c.borderLight}`,
          borderRadius: isClassic ? `${tokens.shape.radiusMd}px` : 0,
          bgcolor: c.surface,
          boxShadow: isClassic ? c.shadowModal : undefined,
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 3,
            py: 2,
            borderBottom: `${
              isClassic
                ? tokens.shape.classicBorderWidth
                : tokens.shape.borderWidth
            } solid ${isClassic ? c.border : c.borderLight}`,
          }}
        >
          <Box
            sx={{
              fontWeight: tokens.typography.weightBold,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontSize: '0.85rem',
              flexGrow: 1,
            }}
          >
            Add Asset
          </Box>
          <IconButton
            size="small"
            onClick={handleClose}
            sx={{ borderRadius: 0 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography sx={{ fontSize: '0.8rem', color: c.textSecondary }}>
            Track an asset by its chain and on-chain asset ID or name. It'll
            show up here even before you hold a balance.
          </Typography>
          {networks.length > 1 && (
            <FormControl fullWidth disabled={submitting}>
              <InputLabel id="asset-network-label">Chain</InputLabel>
              <Select
                labelId="asset-network-label"
                label="Chain"
                value={network}
                onChange={(event) => {
                  setNetwork(event.target.value as AssetNetwork);
                  setError(null);
                }}
              >
                <MenuItem value="qortium">Qortium</MenuItem>
                <MenuItem value="qortal">Qortal</MenuItem>
              </Select>
            </FormControl>
          )}
          <TextField
            label="Asset ID or name"
            value={assetInput}
            onChange={(e) => setAssetInput(e.target.value)}
            fullWidth
            disabled={submitting}
            error={!!error}
            helperText={error ?? undefined}
          />
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleAdd}
            disabled={submitting || !assetInput.trim()}
            disableElevation
            sx={{
              bgcolor: c.accent,
              color: c.accentText,
              '&:hover': { bgcolor: c.accentHover },
              '&.Mui-disabled': { bgcolor: c.borderLight },
              borderRadius: isClassic ? `${tokens.shape.radiusMd}px` : 0,
              py: 1.5,
            }}
          >
            {submitting ? (
              <CircularProgress size={20} sx={{ color: 'white' }} />
            ) : (
              'Add'
            )}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
