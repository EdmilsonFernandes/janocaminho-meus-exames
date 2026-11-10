import { Box, Stack } from '@mui/material';

/**
 * Logotipos oficiais em vetor SVG das principais bandeiras de cartão
 * operadas no Brasil (Visa, Mastercard, Elo, American Express, Hipercard) e Pix.
 *
 * Cada badge é renderizado com proporção física de cartão (120x80),
 * bordas arredondadas e acabamento idêntico ao Stripe Elements / Shopify Checkout.
 */

export const VisaLogo = ({ width = 38, height = 24 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <rect width="120" height="80" rx="4" fill="white" />
    <path fillRule="evenodd" clipRule="evenodd" d="M86.6666 44.9375L90.3239 35.0625L92.3809 44.9375H86.6666ZM100.952 52.8375L95.8086 27.1625H88.7383C86.3525 27.1625 85.7723 29.0759 85.7723 29.0759L76.1904 52.8375H82.8868L84.2269 49.0244H92.3947L93.1479 52.8375H100.952Z" fill="#1434CB" />
    <path fillRule="evenodd" clipRule="evenodd" d="M77.1866 33.5711L78.0952 28.244C78.0952 28.244 75.2896 27.1625 72.3648 27.1625C69.2031 27.1625 61.6955 28.5638 61.6955 35.3738C61.6955 41.7825 70.5071 41.8621 70.5071 45.2266C70.5071 48.5912 62.6034 47.9901 59.9955 45.8676L59.0476 51.4362C59.0476 51.4362 61.8919 52.8375 66.2397 52.8375C70.5869 52.8375 77.1467 50.5544 77.1467 44.3455C77.1467 37.8964 68.2552 37.296 68.2552 34.4921C68.2552 31.6882 74.4602 32.0484 77.1866 33.5711Z" fill="#1434CB" />
    <path fillRule="evenodd" clipRule="evenodd" d="M54.6517 52.8375H47.6191L52.0144 27.1625H59.0477L54.6517 52.8375Z" fill="#1434CB" />
    <path fillRule="evenodd" clipRule="evenodd" d="M42.3113 27.1625L35.9217 44.8213L35.1663 41.0185L35.167 41.0199L32.9114 29.4749C32.9114 29.4749 32.6394 27.1625 29.7324 27.1625H19.1709L19.0476 27.5966C19.0476 27.5966 22.2782 28.2669 26.057 30.5326L31.8793 52.8375H38.8617L49.5238 27.1625H42.3113Z" fill="#1434CB" />
  </svg>
);

export const MastercardLogo = ({ width = 38, height = 24 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <rect width="120" height="80" rx="4" fill="white" />
    <path fillRule="evenodd" clipRule="evenodd" d="M49.6521 58.595H70.3479V21.4044H49.6521V58.595Z" fill="#FF5F00" />
    <path fillRule="evenodd" clipRule="evenodd" d="M98.2675 40.0003C98.2675 53.063 87.6791 63.652 74.6171 63.652C69.0996 63.652 64.0229 61.7624 60 58.5956C65.5011 54.2646 69.0339 47.5448 69.0339 40.0003C69.0339 32.4552 65.5011 25.7354 60 21.4044C64.0229 18.2376 69.0996 16.348 74.6171 16.348C87.6791 16.348 98.2675 26.937 98.2675 40.0003Z" fill="#F79E1B" />
    <path fillRule="evenodd" clipRule="evenodd" d="M50.966 40.0003C50.966 32.4552 54.4988 25.7354 59.9999 21.4044C55.977 18.2376 50.9003 16.348 45.3828 16.348C32.3208 16.348 21.7324 26.937 21.7324 40.0003C21.7324 53.063 32.3208 63.652 45.3828 63.652C50.9003 63.652 55.977 61.7624 59.9999 58.5956C54.4988 54.2646 50.966 47.5448 50.966 40.0003Z" fill="#EB001B" />
  </svg>
);

export const EloLogo = ({ width = 38, height = 24 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <rect width="120" height="80" rx="4" fill="#000000" />
    <path fillRule="evenodd" clipRule="evenodd" d="M27.708 30.5C28.695 30.1667 29.7508 29.9857 30.8495 29.9857C35.6441 29.9857 39.6435 33.4274 40.561 37.9996L47.3554 36.5996C45.7964 28.8289 38.9996 22.9796 30.8495 22.9796C28.9835 22.9796 27.1874 23.2868 25.5107 23.8527L27.708 30.5Z" fill="#FFF200" />
    <path fillRule="evenodd" clipRule="evenodd" d="M19.6909 52.7489L24.2846 47.5005C22.2341 45.6653 20.9399 42.9861 20.9399 39.9996C20.9399 37.0154 22.2329 34.3361 24.2828 32.5023L19.6867 27.2545C16.2025 30.3725 14.0068 34.9269 14.0068 39.9996C14.0068 45.0749 16.2057 49.631 19.6909 52.7489Z" fill="#00A4E0" />
    <path fillRule="evenodd" clipRule="evenodd" d="M40.5582 42.0099C39.6375 46.5784 35.6401 50.0137 30.8491 50.0137C29.7498 50.0137 28.6918 49.8323 27.7046 49.4981L25.5039 56.1447C27.1834 56.713 28.9803 57.0204 30.8491 57.0204C38.9928 57.0204 45.7859 51.1787 47.3513 43.416L40.5582 42.0099Z" fill="#EF4123" />
    <path fillRule="evenodd" clipRule="evenodd" d="M69.9706 46.706C68.8486 47.8089 67.3272 48.4809 65.6473 48.4568C64.4959 48.4373 63.429 48.0889 62.5219 47.5084L60.2731 51.1297C61.8132 52.1136 63.6292 52.6957 65.5869 52.7264C68.4367 52.7692 71.0341 51.6378 72.9227 49.7697L69.9706 46.706ZM59.7284 42.9824C59.7029 42.7418 59.6849 42.4951 59.6917 42.2461C59.7451 38.867 62.4965 36.1707 65.8375 36.2267C67.6561 36.2513 69.2709 37.0929 70.3625 38.3955L59.7284 42.9824ZM65.8988 31.9527C60.228 31.8648 55.5546 36.443 55.469 42.1784C55.4359 44.3279 56.0505 46.3378 57.1318 48.0084L75.7472 39.9676C74.6998 35.436 70.7119 32.029 65.8988 31.9527ZM81.5867 27.2724V47.3281L85.0304 48.7707L83.4013 52.7264L79.9958 51.2958C79.2301 50.9602 78.7119 50.4489 78.3181 49.8714C77.9401 49.2806 77.6598 48.473 77.6598 47.3833V27.2724H81.5867ZM94.0011 36.5405C94.6034 36.3362 95.2481 36.2266 95.9188 36.2266C98.8453 36.2266 101.286 38.3268 101.845 41.1183L105.993 40.2637C105.042 35.5205 100.893 31.9499 95.9188 31.9499C94.7791 31.9499 93.6838 32.1374 92.6611 32.4825L94.0011 36.5405ZM89.1084 50.12L91.9112 46.9168C90.6594 45.7968 89.8712 44.161 89.8712 42.3378C89.8712 40.5164 90.6594 38.8814 91.91 37.7622L89.1052 34.5591C86.9788 36.4623 85.6391 39.2432 85.6391 42.3378C85.6391 45.4363 86.9798 48.2162 89.1084 50.12ZM101.845 43.5654C101.283 46.3528 98.8426 48.4512 95.9187 48.4512C95.2475 48.4512 94.6024 48.3398 93.9991 48.1361L92.656 52.1926C93.6815 52.5394 94.7781 52.7275 95.9187 52.7275C100.888 52.7275 105.036 49.1617 105.992 44.4236L101.845 43.5654Z" fill="white" />
  </svg>
);

export const AmexLogo = ({ width = 38, height = 24 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <rect width="120" height="80" rx="4" fill="#006FCF" />
    <rect x="8" y="10" width="104" height="60" rx="3" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
    <text x="60" y="47" fontFamily="'Arial Black', 'Impact', sans-serif" fontWeight="900" fontSize="20" fill="#ffffff" textAnchor="middle" letterSpacing="2">AMEX</text>
  </svg>
);

export const HipercardLogo = ({ width = 38, height = 24 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <rect width="120" height="80" rx="4" fill="white" />
    <path d="M90.2165 60.5524C94.9703 60.5524 99.1212 59.0903 100.076 54.3889C101.03 49.6875 107.242 19.4501 107.242 19.4501H29.7672C25.0095 19.4501 20.8433 21.1439 19.9061 25.611C18.9676 30.0768 12.7593 60.546 12.7593 60.546L90.2165 60.5524Z" fill="#B3131B" />
    <text x="60" y="46" fontFamily="'Arial Black', sans-serif" fontWeight="900" fontStyle="italic" fontSize="14" fill="#ffffff" textAnchor="middle" letterSpacing="0.5">HIPER</text>
  </svg>
);

export const PixBacenLogo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 512 512" fill="#0d9488" style={{ display: 'block' }}>
    <path d="M112.57 391.19c20.37 0 39.52-7.93 53.93-22.34l75.48-75.48c5.44-5.44 14.3-5.44 19.74 0l75.87 75.87c14.41 14.41 33.56 22.34 53.93 22.34h17.95l-82.72-82.72c-17.47-17.47-17.47-45.9 0-63.37l83.12-83.12h-18.35c-20.37 0-39.52 7.93-53.93 22.34l-75.87 75.87c-5.44 5.44-14.3 5.44-19.74 0l-75.48-75.48c-14.41-14.41-33.56-22.34-53.93-22.34H94.22l83.12 83.12c17.47 17.47 17.47 45.9 0 63.37l-82.72 82.72h17.95z" />
    <path d="M391.52 122.37c-17.47-17.47-45.9-17.47-63.37 0l-16.14 16.14 79.51 79.51 16.14-16.14c17.47-17.47 17.47-45.9 0-63.37l-16.14-16.14zm-271.04 0l-16.14 16.14c-17.47 17.47-17.47 45.9 0 63.37l16.14 16.14 79.51-79.51-16.14-16.14c-17.47-17.47-45.9-17.47-63.37 0zm0 267.26c17.47 17.47 45.9 17.47 63.37 0l16.14-16.14-79.51-79.51-16.14 16.14c-17.47 17.47-17.47 45.9 0 63.37zm271.04 0c17.47-17.47 17.47-45.9 0-63.37l-16.14-16.14-79.51 79.51 16.14 16.14c17.47 17.47 45.9 17.47 63.37 0z" />
  </svg>
);

const badgeCardSx = {
  width: 38,
  height: 24,
  borderRadius: '4px',
  border: '1px solid',
  borderColor: (t: any) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

/**
 * Fileira horizontal de mini-badges estilo Stripe Elements.
 */
export const CardBrandBadges = () => (
  <Stack direction="row" spacing={0.6} alignItems="center" sx={{ flexShrink: 0 }}>
    <Box sx={badgeCardSx} title="Visa">
      <VisaLogo />
    </Box>
    <Box sx={badgeCardSx} title="Mastercard">
      <MastercardLogo />
    </Box>
    <Box sx={badgeCardSx} title="Elo">
      <EloLogo />
    </Box>
    <Box sx={badgeCardSx} title="American Express">
      <AmexLogo />
    </Box>
    <Box sx={badgeCardSx} title="Hipercard">
      <HipercardLogo />
    </Box>
  </Stack>
);
