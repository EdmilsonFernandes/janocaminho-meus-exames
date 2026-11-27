import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { useTranslate } from 'react-admin';
import { RADIUS, tealText } from '../../theme';
import { getSpeechRate, setSpeechRate, speakText, stopSpeakText } from '../../utils/nativeDoc';
import { formatSpeechRate, nextSpeechRate } from '../../utils/speechText';

/**
 * "Ouvir panorama" — o play do topo da tela: lê em voz alta o que o panorama mostra (roteiro em
 * utils/panoramaSpeech). Grátis, sem IA. O botão ao lado troca a velocidade (a mesma preferência
 * de todos os áudios do app) sem voltar ao começo.
 */
export const PanoramaListen = ({ text, lang }: { text: string; lang: string }) => {
  const translate = useTranslate();
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(() => getSpeechRate());

  useEffect(() => () => { void stopSpeakText(); }, []);

  const toggle = () => {
    if (playing) { setPlaying(false); void stopSpeakText(); return; }
    setRate(getSpeechRate());
    setPlaying(true);
    void speakText(text, { lang, onDone: () => setPlaying(false), onFail: () => setPlaying(false) });
  };
  const cycle = () => {
    const next = nextSpeechRate(rate);
    setRate(next);
    setSpeechRate(next);
  };

  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, font: 'inherit', fontWeight: 800,
    cursor: 'pointer', appearance: 'none', border: 0, borderRadius: RADIUS.pill, WebkitTapHighlightColor: 'transparent',
    color: (t: any) => tealText(t.palette.mode),
    bgcolor: (t: any) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.18 : 0.11),
    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
  } as const;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <Box component="button" type="button" onClick={toggle} aria-pressed={playing} data-testid="panorama-listen" sx={{ ...base, gap: 1, pl: 0.75, pr: 1.75, fontSize: 14 }}>
        <Box component="span" aria-hidden sx={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#20b2aa,#178f89)', color: '#fff' }}>
          {playing ? <StopRoundedIcon sx={{ fontSize: 20 }} /> : <PlayArrowRoundedIcon sx={{ fontSize: 22 }} />}
        </Box>
        {translate(playing ? 'panorama.listen.stop' : 'panorama.listen.play')}
      </Box>
      <Box component="button" type="button" onClick={cycle} aria-label={translate('panorama.listen.speed', { rate: formatSpeechRate(rate) })} sx={{ ...base, minWidth: 52, px: 1, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        {formatSpeechRate(rate)}
      </Box>
    </Box>
  );
};
