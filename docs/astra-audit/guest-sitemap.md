# Astra AI — Misafir site haritası (Faz A, devam ediyor)

**Audit başlangıç:** 2025-08-25  
**Yöntem:** Chrome CDP (browser-use), desktop ~1536px  
**Evidence:** `evidence/phase-a/*/page.json`, `tr-home/interaction.jsonl`

---

## Önemli uyarılar

1. **Oturum kirlenmesi:** Bu Chrome profilinde Astra **app oturumu açık** olabilir. `ÜCRETSİZ DENE` / `GİRİŞ YAP` tıklanınca `Yeni sohbet | Astra AI` görüldü — gerçek misafir akışı için **çıkış yapılmış profil veya gizli pencere** ile Faz A app kısmı tekrarlanmalı.
2. **App SPA:** `app.astra-ai.co` sayfalarına doğrudan URL ile gidildiğinde CDP `body` boş (0 node) — muhtemelen render/hydration veya oturum. **Marketing CTA üzerinden** `/pay` başarıyla açıldı (`Astra AI Plus'a abone olun`).
3. **Footer linkleri:** Tıklama sonrası URL değişmedi — linkler **yeni sekme** (`app.astra-ai.co/privacy-policy` vb.) açıyor olabilir; doğrudan URL envanterde mevcut.

---

## Marketing (`astra-ai.co/tr/`)

| Route | Başlık (gözlem) | Scroll yüksekliği | CTA sayısı (uniq) | Evidence |
|-------|-----------------|-------------------|-------------------|----------|
| `/tr/` | Çalışma ve Sınav Hazırlığı… | ~11855px, 12 section | 59 | `tr-home/` |
| `/tr/sinav-hazirligi/` | Sınav Hazırlığı – Kişisel Öğrenme… | ~8976px | 35 | `sinav-hazirligi/` |
| `/tr/mobil-uygulama` | Astra AI Uygulamasını İndirin… | ~3707px | 32 | `mobil-uygulama/` |
| `/tr/yardim` | Yardım (EN title leak on tab) | ~2607px | 33 | `yardim/` |
| `/tr/bize-ulasin` | İletişim | ~1146px | 23 | `bize-ulasin/` |
| `/tr/kunye` | Künye | ~1386px | 25 | `kunye/` |
| `/tr/ogretmenler-ve-profesorler-icin` | Öğretmenler için ücretsiz erişim | (CDP) | 48+ interaktif | `ogretmenler/` |

**Harici:** `ugc.astra-ai.co` (Yaratıcı Programı) — henüz crawl edilmedi.

---

## Ana sayfa (`/tr/`) — header / hero

| Öğe | Rol | Tıklama sonucu (kayıt id) |
|-----|-----|---------------------------|
| Logo | link | (pending scroll-top) |
| Sınav Hazırlığı | link | → `/tr/sinav-hazirligi/` (`home-exam-prep-nav`) |
| Yaratıcı Programı | link | (pending → ugc) |
| tr TR | button | locale menü açılır (`home-locale`) |
| GİRİŞ YAP | link/button | → `app.astra-ai.co/tr-TR` — **oturum varsa sohbet** (`home-login-link`) |
| Plus satın al (header) | link | → `app.../pay` (`home-plus-link`) |
| ÜCRETSİZ DENE | link | → `app.../tr-TR` (`home-free-try-link`) |
| ASTRA AI PLUS (hero) | link | in_page (aynı URL — scroll/viewport?) (`home-plus-hero`) |

---

## Ana sayfa — özellik kartları

| Öğe | Sonuç |
|-----|--------|
| Sözlü sınav | → `app.astra-ai.co/tr-TR` (`home-oral-exam`) |
| Deneme sınavı (“15 left”) | in_page (`home-mock-exam`) — muhtemelen anchor/modal |
| Matematik (örnek ders kartı) | in_page (`home-math-card`) |
| Aradığın ders yok mu? | in_page (`home-cant-find-subject`) |
| Diğer 10+ ders kartı | **pending** (aynı pattern beklenir) |

---

## Ana sayfa — FAQ (accordion)

| Soru | Sonuç |
|------|--------|
| Astra AI nedir ve çocuğuma… | expand (`home-faq-1`) |
| Diğer ~5 FAQ | **pending** |

---

## Ana sayfa — footer (hedef URL’ler)

| Label | Bilinen href (DOM) | Tıklama (CDP) |
|-------|-------------------|---------------|
| Gizlilik Politikası | `app.astra-ai.co/privacy-policy` | in_page / yeni sekme? |
| Şartlar ve Koşullar | `app.astra-ai.co/terms-conditions` | in_page |
| Yardım ve Destek | `astra-ai.co/tr/yardim` | in_page |
| Bize Ulaşın | `astra-ai.co/tr/bize-ulasin` | in_page |
| Künye | `astra-ai.co/tr/kunye` | pending |
| İndir (mobil) | `astra-ai.co/tr/mobil-uygulama` | pending |
| iOS / Android | App Store / Play | external |
| Sosyal | Instagram, X, TikTok, LinkedIn | external |

---

## App (misafir hedefleri)

| Route | Not |
|-------|-----|
| `/tr-TR/login` | Doğrudan URL → redirect `/tr-TR` (oturum?) |
| `/tr-TR/pay` | CTA ile: Plus abonelik ekranı |
| `/privacy-policy`, `/terms-conditions` | Legal SSR — AX sparse, **pending screenshot** |
| `/tr-TR/exam-preps` | Sınav hazırlığı listesi — **pending oturumsuz** |
| `/tr-TR/onboarding` | Ücretsiz dene akışı — **pending oturumsuz** |

---

## Sınav hazırlığı landing

- **Play Video** butonu: in_page (`sinav-hazirligi` — video modal beklenir, **pending doğrulama**)
- Çoklu **ÜCRETSİZ DENE** varyantları (link + button) — **pending** tıklama matrisi

---

## Cortex Plus mapping (misafir)

| Astra | Cortex Plus (hedef) |
|-------|---------------------|
| `/tr/` | `/` |
| `/tr/sinav-hazirligi/` | `/sinav-hazirligi` |
| `/tr/mobil-uygulama` | `/yardim` mobil bölüm + PWA |
| `/tr/yardim` | `/yardim` |
| `/tr/bize-ulasin` | `/iletisim` |
| `/tr/kunye` | `/hakkimizda` |
| `app.../pay` | `/fiyatlandirma` + `/paketler` |
| `app.../login` | `/giris` |
| legal on app | `/gizlilik`, `/kullanim-kosullari` |

---

## Sıradaki adımlar (Faz A tamamlama)

- [ ] Astra app **çıkış** → gerçek misafir login/pay/onboarding crawl
- [ ] Ana sayfa kalan 50+ interaktif öğe + mobil viewport 390px
- [ ] `sinav-hazirligi` tüm CTA + video modal
- [ ] Footer yeni sekme doğrulama (`list_tabs`)
- [ ] Screenshot paketi (section bazlı)
- [ ] **Faz B:** Free hesap handoff

---

## İstatistik (şu an)

- **Interaction kayıtları:** 15+ (`tr-home/interaction.jsonl`)
- **Sayfa envanteri:** 5 marketing + 5 app URL denemesi
- **Design notu:** Ana sayfa 12 section, yoğun ders grid, dual CTA (ücretsiz / Plus), FAQ accordion, cookie preferences butonu
