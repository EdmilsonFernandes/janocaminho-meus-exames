# Como fabricar um short (sem câmera, sem aparecer, zero custo)

> Pipeline validado em 31/08/2026 com o vídeo 01 (TSH alta) → `out/01-tsh-alta.mp4`.
> Tudo local: narração de IA (edge-tts, voz pt-BR grátis) + slides com a identidade do app + ffmpeg.

## O que cada peça faz
| Arquivo | Função |
|---|---|
| `slides.html` | Os 3 slides (gancho/conteúdo/CTA) — tema teal + robô Dr. Exame. `?s=1\|2\|3` escolhe o slide |
| `robot.png` | Mascote (copiado de `packages/web/public/app-icon.png`) |
| `srt2ass.mjs` | Converte as legendas do TTS em ASS estilizado (caixa escura, texto grande) |
| `node_modules/ffmpeg-static` | Binário do ffmpeg (npm, sem admin) |

## Passo a passo (a partir daqui é ~10 min por vídeo)

### 1. Roteiro → narração
Editar o texto falado (do arquivo `roteiros-01-10.md`) e rodar:
```bash
cd "marketing/youtube-shorts/pipeline"
python -m edge_tts --voice pt-BR-AntonioNeural --rate=+8% \
  --text "COLE O TEXTO FALADO AQUI" \
  --write-media narra.mp3 --write-subtitles narra.srt
```
- Voz alternativa: `pt-BR-FranciscaNeural` (feminina).
- Anotar a duração (`ffmpeg -i narra.mp3`) e o tempo onde começa o CTA (grep no `narra.srt`).

### 2. Slides
Editar `slides.html` (trocar textos do slide 2; slides 1 e 3 praticamente não mudam) e capturar:
```bash
python -m http.server 8777 &   # servir a pasta
```
No Playwright (browser 1080×1920): abrir `http://localhost:8777/slides.html?s=1`, screenshot → `slide1.png`; repetir `?s=2`, `?s=3`.

### 3. Montar (SEM legenda queimada)
> Decisão 31/08/2026: **não queimar legenda** no vídeo. Legenda queimada não desliga (feedback do dono), corta frases longas e o YouTube/TikTok/Reels geram automática da voz limpa de IA — o espectador controla. O `narra.srt` do TTS pode ser enviado no YouTube Studio como legenda OFICIAL (opcional, desativável, sem retrabalho).

Ajustar as durações dos 3 trechos (devem somar a duração do áudio; o 3º começa no tempo do CTA):
```bash
FF=$(node -e "console.log(require('ffmpeg-static'))")
"$FF" -y -loop 1 -t 7.5 -i slide1.png -loop 1 -t 23.9 -i slide2.png -loop 1 -t 12.6 -i slide3.png \
  -i narra.mp3 -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[vout]" \
  -map "[vout]" -map 3:a -c:v libx264 -preset medium -crf 20 -r 30 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -movflags +faststart -shortest ../out/NN-tema.mp4
```

### 4. Upload (YouTube)
1. studio.youtube.com → **Criar → Enviar vídeo** → arrastar o .mp4
2. Título = a busca literal: ex. `O que significa TSH ALTA no exame (não é o que você pensa)`
3. Descrição:
   ```
   A TSH alta geralmente indica tireoide devagar (hipotireoidismo) — e quem ajuda a fechar é o T4 livre.
   Decifre o SEU exame com IA: https://drexame.janocaminho.com.br
   Conteúdo educativo — não substitui consulta, diagnóstico ou tratamento médico.
   ```
4. #Shorts não é mais obrigatório (YouTube detecta vertical ≤3min); marcar **"Não, não é feito pra crianças"** (saúde = público adulto... se perguntar).
5. Visibilidade: **Pública**. Depois: fixar comentário com o link + disclaimer.
6. Mesmo arquivo no TikTok e Instagram Reels.

## Checklist por vídeo
- [ ] Faixa de referência bate com o laboratório comum
- [ ] Disclaimer verbal no fim ("conteúdo educativo, não substitui seu médico")
- [ ] Título = busca exata, sem criatividade
- [ ] Link puro na descrição — **YouTube NÃO torna clicável URL com `?query`** (aprendido 31/08: utm_source quebrou o link). Tráfego do YouTube mede-se pelo referer no nginx/access log, não por UTM
