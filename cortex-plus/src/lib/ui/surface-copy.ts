/**
 * Uygulama genelinde ortak yüzey metinleri (Prompt 7).
 * Yeni metin eklerken learner-fluency denetiminden geçir.
 */
export const SURFACE_COPY = {
  loading: "Yükleniyor…",
  errorTitle: "Bir şeyler ters gitti",
  errorBody: "Bir şeyler ters gitti. Yeniden dene.",
  retry: "Yeniden dene",
  offline: "Çevrimdışısın. Yeniden dene.",
  saveFailed: "Kaydedilemedi.",
  copied: "Kopyalandı",
  leaveTitle: "Çıkmak istiyor musun?",
  leaveStay: "Devam et",
  leaveExit: "Çık",
} as const;
