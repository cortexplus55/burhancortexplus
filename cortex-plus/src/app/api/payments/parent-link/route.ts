/**
 * Eski adres (29 Ekim 2026). Faz 5 §2 ile işleyici `/api/billing/parent-link`e taşındı: 48 saatlik belirteç,
 * `/veli-odeme/<belirteç>` adresi ve öğrencinin ağzından WhatsApp metni. Eski istemciler kırılmasın diye aynı
 * işleyici burada da yanıt verir.
 */
export { POST } from "@/app/api/billing/parent-link/route";
