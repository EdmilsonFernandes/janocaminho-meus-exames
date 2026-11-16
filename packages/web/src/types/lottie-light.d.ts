// Shim de tipos p/ o build light do lottie-web (menor que o player completo; carregado
// só via import dinâmico na celebração). A API é a mesma do pacote principal.
declare module 'lottie-web/build/player/lottie_light' {
  import type lottie from 'lottie-web';
  const light: typeof lottie;
  export default light;
  export * from 'lottie-web';
}
