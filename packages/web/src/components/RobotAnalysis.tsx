import { Box } from '@mui/material';
import { AnalysisScan } from './AnalysisScan';

/**
 * RobotAnalysis — migrado para a cena premium AnalysisScan (26/10).
 * Integra o mascote oficial DrExameRobot (fiel ao app-icon.png, olhos piscando,
 * antena com bob) + scanner a laser no laudo + chips de biomarcadores em leitura.
 * Mantido como wrapper retrocompatível para todas as telas do sistema.
 */
export const RobotAnalysis = ({ label }: { label?: string }) => (
  <Box sx={{ width: '100%', py: 1 }}>
    <AnalysisScan label={label} />
  </Box>
);

