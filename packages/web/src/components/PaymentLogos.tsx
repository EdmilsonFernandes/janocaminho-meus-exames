import { Box, Typography, Stack } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';

/**
 * Logotipo oficial do ASAAS com caminhos vetoriais extraídos do CDN oficial da marca.
 * Exibe a tipografia geométrica característica ('A' arqueado característico do Asaas).
 */
export const AsaasLogo = ({
  height = 24,
  variant = 'badge',
}: {
  height?: number;
  /** 'badge' = botão/pílula azul royal oficial; 'transparent' = somente o vetor */
  variant?: 'badge' | 'transparent';
}) => {
  // Proporção original do logo oficial Asaas: 100 / 17 ≈ 5.88
  const svgWidth = Math.round(height * (100 / 17) * 0.72);
  const svgHeight = Math.round(height * 0.72);

  const asaasSvg = (fillColor: string) => (
    <svg
      viewBox="0 0 100 17"
      width={svgWidth}
      height={svgHeight}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <path
        d="M67.0144 10.2322L71.1732 2.8531L75.291 10.2116C74.1232 9.6817 72.6687 9.41646 71.0912 9.41646C69.6159 9.41646 68.2023 9.68169 67.0144 10.2316M45.6871 10.2322L49.8459 2.8531L53.9638 10.2116C52.796 9.6817 51.3414 9.41646 49.764 9.41646C48.2887 9.41646 46.8751 9.68169 45.6871 10.2316M5.98205 10.2322L10.1409 2.69007L14.2997 10.2122C13.1319 9.68231 11.6566 9.41707 10.0791 9.41707C8.60378 9.41707 7.17002 9.6823 5.98144 10.2322M99.9988 12.067C99.9988 15.1653 97.1508 17 92.0498 17C88.4034 17 85.3096 16.3272 82.1339 14.3294L83.1789 12.4746C86.1497 14.3501 88.6901 15.0022 92.0296 15.0022C95.7379 15.0022 97.684 13.9218 97.684 12.0262C97.684 10.4975 96.2704 9.86542 93.4842 9.5801L88.5672 9.091C84.9819 8.74425 82.7081 7.37853 82.7081 4.87157C82.7081 1.89558 85.9247 0 91.0257 0C94.2014 0 96.721 0.61138 99.2412 2.18089L98.2171 4.11723C96.2093 2.79227 93.8535 2.07869 90.7597 2.07869C87.1543 2.07869 85.0235 3.21993 85.0235 4.79005C85.0235 6.27805 86.56 6.84867 88.7934 7.07314L93.8131 7.56225C97.8491 7.94976 100 9.397 100 12.067M81.3758 16.6332L72.2181 0.386904H70.1491L61.0115 16.6332H63.47L64.4739 14.7784C65.6417 12.6175 67.6698 11.4763 71.0912 11.4763C74.5127 11.4763 76.6637 12.5975 77.8522 14.799L78.8354 16.6338H81.3758V16.6332ZM60.0485 16.6332L50.8908 0.386904H48.8218L39.6843 16.6332H42.1428L43.1467 14.7784C44.3145 12.6175 46.3425 11.4763 49.764 11.4763C53.1855 11.4763 55.3364 12.5975 56.525 14.799L57.5081 16.6338H60.0485V16.6332ZM38.9873 12.067C38.9873 15.1653 36.1393 17 31.0383 17C27.3918 17 24.2981 16.3272 21.1224 14.3294L22.1673 12.4746C25.1382 14.3501 27.6786 15.0022 31.0181 15.0022C34.7263 15.0022 36.6725 13.9218 36.6725 12.0262C36.6725 10.4975 35.2589 9.86542 32.4727 9.5801L27.5557 9.091C23.9704 8.74425 21.6965 7.37853 21.6965 4.87157C21.6965 1.89558 24.9132 0 30.0142 0C33.1899 0 35.7095 0.61138 38.2297 2.18089L37.2056 4.11723C35.1977 2.79227 32.842 2.07869 29.7482 2.07869C26.1427 2.07869 24.012 3.21993 24.012 4.79005C24.012 6.27805 25.5484 6.84867 27.7819 7.07314L32.8016 7.56225C36.8375 7.94976 38.9885 9.397 38.9885 12.067M8.05168 2.30256L0 16.6326H2.45849L3.46242 14.7777C4.63022 12.6376 6.63809 11.4757 10.0797 11.4757C13.5214 11.4757 15.6729 12.6376 16.8407 14.7984L17.8239 16.6332H20.3643L11.8009 1.42655C11.3912 0.692898 10.8177 0.386904 9.8749 0.386904H2.97085L4.02492 1.45879C4.6669 2.09755 5.17071 2.30256 6.0652 2.30256H8.05168Z"
        fill={fillColor}
      />
    </svg>
  );

  if (variant === 'transparent') {
    return (
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height,
          flexShrink: 0,
        }}
      >
        {asaasSvg('#0038E5')}
      </Box>
    );
  }

  // Variant 'badge' com fundo azul royal de alta visibilidade
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        minWidth: Math.round(svgWidth + 24),
        bgcolor: '#0038FF',
        borderRadius: `${Math.max(5, Math.round(height * 0.22))}px`,
        px: 1.5,
        boxShadow: '0 2px 5px rgba(0, 56, 255, 0.28)',
        flexShrink: 0,
        transition: 'transform 0.15s ease',
        '&:hover': {
          transform: 'translateY(-1px)',
        },
      }}
    >
      {asaasSvg('#FFFFFF')}
    </Box>
  );
};

/**
 * Logotipo oficial do OPENPIX (versão cropped de alta resolução ou vetor nítido).
 * Utiliza o arquivo cropped de proporção horizontal perfeita sem bordas vazias.
 */
export const OpenPixLogo = ({ height = 24 }: { height?: number }) => {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
        borderRadius: `${Math.max(5, Math.round(height * 0.22))}px`,
        px: 1.2,
        border: '1px solid',
        borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        flexShrink: 0,
      }}
    >
      <Box
        component="img"
        src={`${import.meta.env.BASE_URL}logo-openpix.webp`}
        alt="OpenPix"
        sx={{
          height: Math.round(height * 0.78),
          width: 'auto',
          display: 'block',
          objectFit: 'contain',
        }}
      />
    </Box>
  );
};

export interface PaymentLogosProps {
  /** 'all' mostra OpenPix e Asaas; 'asaas' só Asaas (para cartão); 'openpix' só OpenPix */
  provider?: 'all' | 'asaas' | 'openpix';
  /** 'inline' (default), 'badge' (com moldura e selo de segurança) ou 'clean' */
  variant?: 'inline' | 'badge' | 'clean';
  /** Altura base dos logos em pixels (default: 26) */
  height?: number;
}

/**
 * Componente unificado e nítido de Trust Badges de Pagamento.
 * Resolve os logos minúsculos e ilegíveis com vetores de alta fidelidade e texto claro.
 */
export const PaymentLogos = ({
  provider = 'all',
  variant = 'inline',
  height = 26,
}: PaymentLogosProps) => {
  if (variant === 'badge') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          borderRadius: '14px',
          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.025)',
          border: '1px solid',
          borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          width: '100%',
        }}
      >
        <Stack direction="row" spacing={0.6} alignItems="center">
          <LockOutlinedIcon sx={{ fontSize: 14, color: '#178f89' }} />
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', letterSpacing: '0.01em' }}>
            Ambiente 100% Seguro · Criptografia SSL 256 bits
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" flexWrap="wrap">
          {(provider === 'all' || provider === 'asaas') && (
            <Stack direction="row" spacing={1} alignItems="center">
              <AsaasLogo height={height} />
              {provider === 'asaas' && (
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600 }}>
                  Processado diretamente pelo Asaas
                </Typography>
              )}
            </Stack>
          )}

          {provider === 'all' && (
            <Typography sx={{ fontSize: 12, color: 'text.disabled', px: 0.5 }}>•</Typography>
          )}

          {(provider === 'all' || provider === 'openpix') && (
            <Stack direction="row" spacing={1} alignItems="center">
              <OpenPixLogo height={height} />
              {provider === 'openpix' && (
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 600 }}>
                  PIX Banco Central
                </Typography>
              )}
            </Stack>
          )}
        </Stack>

        <Typography sx={{ fontSize: 10.5, color: 'text.disabled', textAlign: 'center', lineHeight: 1.4 }}>
          🛡️ Seus dados de cartão não são salvos em nossos servidores · Em conformidade com PCI-DSS Level 1
        </Typography>
      </Box>
    );
  }

  // Variant 'inline'
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      {(provider === 'all' || provider === 'asaas') && <AsaasLogo height={height} />}
      {(provider === 'all' || provider === 'openpix') && <OpenPixLogo height={height} />}
    </Box>
  );
};

