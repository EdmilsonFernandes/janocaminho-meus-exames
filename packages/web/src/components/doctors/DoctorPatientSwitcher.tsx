import { useState } from 'react';
import { Autocomplete, Avatar, Box, Button, Dialog, DialogContent, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { photoUrlFor } from '../../config';

/** Pega o nome do paciente (shape do /doctor/patients: {patient:{fullName}} ou {fullName}). */
const pName = (p: any): string => p?.patient?.fullName || p?.fullName || 'Paciente';
/** Pega o id (patient.id ou id). */
const pId = (p: any): string => p?.patient?.id || p?.id || '';
/** Foto: p.patient.photoUrl || p.photoUrl (shape flexível). */
const pPhoto = (p: any): string | undefined => {
  const pid = pId(p);
  const has = p?.patient?.photoUrl || p?.photoUrl;
  return has && pid ? photoUrlFor(pid, 0) : undefined;
};

/**
 * DoctorPatientSwitcher — seletor de paciente do portal do médico.
 * - Desktop: <Autocomplete> inline (busca por fullName + avatar).
 * - Mobile (sm down): <Button> abre <Dialog> com o Autocomplete (evita inline apertado).
 * Persistir a seleção é trabalho do pai (onSelect repassa o pid). Visual teal premium.
 */
export const DoctorPatientSwitcher = ({ patients, value, onSelect }: { patients: any[]; value: string | null; onSelect: (pid: string) => void }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const selected = patients.find((p) => pId(p) === value) ?? null;

  const renderOption = (props: any, option: any) => {
    const pid = pId(option);
    const nm = pName(option);
    return (
      <Box component="li" {...props} key={pid || nm} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.75 }}>
        <Avatar src={pPhoto(option)} sx={{ width: 38, height: 38, bgcolor: 'rgba(32,178,170,.10)', color: '#178f89', fontWeight: 800, flexShrink: 0 }}>{nm.charAt(0)}</Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nm}</Typography>
          {option?.relationship && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{option.relationship}</Typography>}
        </Box>
      </Box>
    );
  };

  const input = (params: any) => (
    <TextField
      {...params}
      placeholder={selected ? undefined : 'Selecionar paciente…'}
      size="small"
      // Ícone de TROCA (feedback E5): sinaliza que o campo alterna o paciente em foco.
      slotProps={{ input: { ...params.InputProps, startAdornment: (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', pl: 1.25, pr: 0.25, color: '#178f89' }} aria-hidden>
          <SwapHorizIcon fontSize="small" />
        </Box>
      ) } }}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '999px', bgcolor: 'background.paper', pr: 1 } }}
    />
  );

  const autocomplete = (
    <Autocomplete
      options={patients}
      value={selected}
      getOptionLabel={pName}
      isOptionEqualToValue={(a, b) => pId(a) === pId(b)}
      onChange={(_, v) => { if (v) { onSelect(pId(v)); setMobileOpen(false); } }}
      renderOption={renderOption}
      renderInput={input}
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: '12px', mt: 0.5 } } }}
    />
  );

  if (!isMobile) {
    return <Box sx={{ minWidth: 260, maxWidth: 360 }}>{autocomplete}</Box>;
  }

  return (
    <>
      <Button
        fullWidth
        variant="outlined"
        startIcon={<Avatar src={selected ? pPhoto(selected) : undefined} sx={{ width: 22, height: 22, bgcolor: 'rgba(32,178,170,.14)', color: '#178f89', fontSize: 11, fontWeight: 800 }}>{selected ? pName(selected).charAt(0) : ''}</Avatar>}
        onClick={() => setMobileOpen(true)}
        sx={{ justifyContent: 'flex-start', borderRadius: '999px', textTransform: 'none', fontWeight: 700, color: 'text.primary', borderColor: 'divider', py: 0.85, px: 1.5, minHeight: 40 }}
      >
        <Box sx={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? pName(selected) : 'Selecionar paciente…'}</Box>
        <SwapHorizIcon sx={{ color: '#178f89', fontSize: 22 }} />
      </Button>
      <Dialog open={mobileOpen} onClose={() => setMobileOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={1.5}>
            <Typography sx={{ fontWeight: 800, fontFamily: '"Poppins",sans-serif' }}>Selecionar paciente</Typography>
            {autocomplete}
            <Button onClick={() => setMobileOpen(false)} sx={{ alignSelf: 'flex-end', textTransform: 'none', borderRadius: '999px' }}>Fechar</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
};
