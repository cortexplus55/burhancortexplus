# Öğrenme ekranları — boşluk envanteri

**Tarih:** 2026-09-24. **Taban:** `main` @ PR #69.
**Kapsam:** sınav hazırlığının ders akışı (L-01…L-20). Sohbet, podcast ve sözlü
kabuk #65–#67'de kapandı; burada yeniden yazılmaz. Astra paritesi arşivdir
(`docs/astra-parity/`); satırlar aşağıdaki dosyalardan doğrulandı.

Durum: **DONE** ekran duruyor. **PARTIAL** parça var, kasıtlı sınır yazılı.
**MISSING** bu turda kapatıldı ya da hâlâ yok.

| ID | Ekran | Durum | Nerede |
|---|---|---|---|
| L-01 | Çalışma yolu (düğüm izi) | DONE | `exam-prep-home.tsx` |
| L-02 | Metrik `X / Y konu` | DONE | hazırlık evi, liste. Saat kotası plan birimi değil |
| L-03 | Aşinalık, 5 seviye (🌱→🍎) | DONE | `LessonOpenChrome` · düğüm + konu okuyucu |
| L-04 | Ruh hali, 6 seviye | DONE | aynı. Ton cümlesi: “Öğretmen kendini nasıl hissettiğine göre uyum sağlayacak.” |
| L-05 | Önerilen ders kartı | DONE | `ÖNERİLEN DERS` / giriş dersi / `Devam et`. Evdeki podcast kartı ayrı duruyor |
| L-06 | Ders oluştur kartı | DONE | “Konuyu öğretmeninle keşfet” + `Ders oluştur`. Zorluk, aşinalıktan gelir |
| L-07 | Üretim bekleme | DONE | `NodeGenerationProgress` — küre + beş adım. Konu okuyucu da bunu kullanır |
| L-08 | Slayt kabuğu `n / N` | DONE | `exam-lesson-steps.tsx` |
| L-09 | Gömülü doğru/yanlış | DONE | `DOĞRU MU YANLIŞ MI?` · solda Yanlış, sağda Doğru |
| L-10 | Hızlı sınav + açıklama | DONE | `HIZLI SINAV`, `AÇIKLAMA` |
| L-11 | Doğru/yanlış çubuğu | DONE | `🎉 Doğru` / `🤔 Yanlış` + `Devam et` |
| L-12 | Tekrar kapısı | DONE | `TEKRARLA` · yanlışlar dersin sonunda bir kez daha |
| L-13 | Uyarı kutusu (callout) | PARTIAL | Kutu `note` varsa çizilir (`calloutTone`). Not isteğe bağlı: bozuk not dersi düşürmesin diye doğrulayıcı notu şart koşmuyor |
| L-14 | Kart karuseli | PARTIAL | İki veya daha çok `cards` varsa çizilir. İstem uydurma kart yasaklıyor; kardeş kavram yoksa kart yazılmaz |
| L-15 | Konu okuyucu boş hali | DONE | `/calis` artık “Henüz ders yok / Bu konuyu anlat” demiyor. Aynı kapı: aşinalık → ruh hali → öneri → ders oluştur. Sinyaller `POST /api/learning/exam-prep/lesson` gövdesine gider |
| L-16 | Konu okuyucu Suspense | DONE | `useSearchParams` ve boş yedek kalktı. Sayfa `force-dynamic`; konu kimliği sunucudan iner |
| L-17 | Sesli mod anahtarı (giriş dersi) | PARTIAL | “Yazmak yerine konuş” soru-cevap ve sözlüde duruyor. Slayt dersinde anahtar yok: `voiceMode` yalnızca `qa` ve `oral` için ses oturumu açıyor. Açılırsa düğme yalan söylemiş olurdu |
| L-18 | Sokratik sohbet dersi | PARTIAL | Astra’nın “Konuşmayı atla / aklına ilk ne geliyor” sohbeti burada slayt dersi. Ayrı bir sohbet dersi açılmadı. Oluşturma metni “kısa bir ders” diyor |
| L-19 | Tek başına doğru/yanlış düğümü | PARTIAL | Çalışıyor (iddia, Doğru/Yanlış, açıklama). Slayt kabuğunun içinde değil; ayrı etkinlik |
| L-20 | Ders sonucu | DONE | Skor, “Dersi tekrarla” oluşturma kartına döner, eğitmen notu, “Şimdi dinle” |

## Bu turda kapananlar

1. **L-05 / L-06** — Giriş dersi düğümü ruh halinden sonra öneri kartına, oradan oluşturma kartına geçiyor. Diğer düğüm türleri (test, podcast, soru-cevap) eski kurulum kartında kalıyor; soru-cevapta ses anahtarı duruyor.
2. **L-15** — Konu okuyucusunda ders yokken aynı kapı. Aşinalık konu satırına, ruh hali `study_session_moods` kaydına yazılıyor. İstem, sinyal cümlesini ve zorluk satırını alıyor.
3. **L-16** — `/deneme-sinavlari/[prepId]/calis` boş Suspense yedeği yüzünden açılmaz haldeydi. Sınır kalktı.

## Bilerek yapılmayanlar

- Callout ve karuseli her derse zorlamak. İkisi de süs: yoklukları dersi öğretmez, uydurma kart ise öğretir gibi görünüp kaynağı bozar.
- Giriş dersine sahte ses anahtarı.
- Sohbet biçiminde ikinci bir ders ürünü.
- PayTR, yönetim, kota yeniden tasarımı.
