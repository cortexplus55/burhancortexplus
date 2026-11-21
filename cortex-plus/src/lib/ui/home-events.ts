/** Ana ekranın üst çubuğundaki "Başla" düğmesi sohbet paneline bu olayla haber verir (13 Kasım 2026). */
export const HOME_START_EVENT = "cp:home-start";

/**
 * Öğretmen v3 sohbet şeridindeki saat düğmesi geçmiş paneline bu olayla haber verir (21 Kasım 2026). Olay iptal
 * edilebilir: panel dinliyorsa `preventDefault()` der; dinleyen yoksa düğme Geçmiş konuşmalar sayfasını açar.
 * `detail.opener`: çekmece kapanınca odağın döneceği düğme.
 */
export const TUTOR_HISTORY_EVENT = "cp:tutor-history";
export type TutorHistoryDetail = { opener?: HTMLElement | null };
