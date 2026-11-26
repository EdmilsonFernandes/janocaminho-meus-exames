import type { ComponentType } from 'react';
import type { SxProps, Theme } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import MonitorWeightOutlinedIcon from '@mui/icons-material/MonitorWeightOutlined';
import AccessibilityNewOutlinedIcon from '@mui/icons-material/AccessibilityNewOutlined';
import OpacityOutlinedIcon from '@mui/icons-material/OpacityOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import VaccinesOutlinedIcon from '@mui/icons-material/VaccinesOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import type { PanoramaKey } from '../../utils/panoramaPresenter';

type Icon = ComponentType<{ sx?: SxProps<Theme> }>;

/** Ícone de cada área do panorama — MUI, em todo o app a mesma área usa o mesmo símbolo. */
const ICONS: Record<PanoramaKey, Icon> = {
  exams: ScienceOutlinedIcon,
  heart: FavoriteBorderOutlinedIcon,
  weight: MonitorWeightOutlinedIcon,
  bodyComp: AccessibilityNewOutlinedIcon,
  hormones: OpacityOutlinedIcon,
  mind: PsychologyOutlinedIcon,
  diary: MenuBookOutlinedIcon,
  vitality: BedtimeOutlinedIcon,
  meds: MedicationOutlinedIcon,
  care: MedicalServicesOutlinedIcon,
  vaccines: VaccinesOutlinedIcon,
  emergency: ErrorOutlineOutlinedIcon,
};

export const AreaIcon = ({ area, sx }: { area: PanoramaKey; sx?: SxProps<Theme> }) => {
  const Icon = ICONS[area] ?? ErrorOutlineOutlinedIcon;
  return <Icon sx={sx} />;
};
