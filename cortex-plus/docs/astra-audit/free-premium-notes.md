# Astra AI — Ücretsiz / Premium (Aşama B & C)

**Durum:** Oturum açık alanlar tarayıcıda manuel giriş gerektirir. Bu oturumda **authenticated UI gözlemlenmedi**; aşağıdaki maddeler spec + marketing/app URL çıkarımı + tipik edtech AI ürün kalıpları ile **infer** edilmiştir. Giriş sonrası doğrulama için: giriş sayfasını açın → otomasyon durur → siz giriş yapın → "tamam" deyin.

## Aşama B — Ücretsiz (beklenen alanlar, doğrulama: requires-confirmation)

| Alan | Beklenen davranış (çıkarım) | Premium kontrolü | Cortex Plus tasarımı |
|------|----------------------------|------------------|----------------------|
| Onboarding | Rol/sınıf/ders/hedef | Hayır | `/onboarding` adım sihirbazı, ilerleme kaydı |
| Dashboard | Özet, hızlı eylemler | Kısmi kilit | `/dashboard` kredi + devam eden iş |
| AI öğretmen | Sınırlı mesaj/gün | Limit sonrası paywall | Kredi önizleme + yumuşak upsell |
| Görsel/PDF | Düşük kota veya kilit | Evet | `UpgradeSheet` + state `returnTo` |
| Quiz/flashcard | Temel üretim kotası | Gelişmiş analiz kilit | Ayrı action_code fiyatları |
| Deneme sınavı | Sınırlı sayı | Tam analiz premium | P0: mini + P1: full grade |
| Paketler | `/pay` benzeri | — | `/paketler` + karşılaştırma tablosu (özgün metin) |

### Paywall mantığı (Cortex Plus — özgün)

1. **İşlem öncesi:** Tüketilecek kredi + kalan ücretsiz hak modalda.
2. **Limit doldu:** Özellik kartı kilitli; alternatif (ör. metin sohbet) açık kalır.
3. **Yönlendirme:** `sessionStorage.returnPath` ile paketten dönüşte yarım sohbet korunur.
4. **Metin:** "Daha fazla AI ders saati" / "Gelişmiş model ve dosya analizi" — Astra CTA kopyası yok.
5. **Dark pattern yok:** Kapatınca dashboard’a dönüş; zorunlu timer yok.

## Aşama C — Premium (beklenen, doğrulama: requires-confirmation)

| İşlev | Akış notu | Cortex Plus iyileştirme |
|-------|-----------|-------------------------|
| Streaming sohbet | Konu seçimi → mesaj | Tek `/ogretmen` + quick actions |
| Görsel soru | Upload → çözüm | `IMAGE_SOLUTION` + gpt-4o router |
| PDF RAG | Upload → işle → soru | Canlı `processing_jobs` durumu |
| Quiz/flashcard | Sohbetten veya modülden üret | Tek tık "buna quiz yap" |
| Deneme + analiz | Uzun işlem | İlerleme çubuğu + e-posta opsiyonel |
| Abonelik ekranı | Görüntüleme OK; iptal **unsafe-to-test** | `/odemeler` salt okunur geçmiş |

## Güvenlik nedeniyle test edilmeyen

- Abonelik iptali/değiştirme, gerçek ödeme, hesap silme, profil kritik alan değişikliği, başka kullanıcıyla paylaşım.

## Dosya yükleme testi

Onay protokolü: sentetik dosya adı + hedef hesap (free/premium) → kullanıcı onayı → yükleme.
