# Astra AI → Cortex Plus: Tam parity planı

**Hedef:** Misafir, ücretsiz ve premium kullanıcı deneyiminde **sayfa yapısı, bileşenler, tıklama tepkileri ve üretilen çıktılar** Astra ile aynı olacak. **Tek bilinçli fark:** marka adı ve Cortex Plus kimliği (logo/wordmark, domain `cortexplus.app`). Metinler Türkçe kalır; Astra marka adı ve tescilli görseller kopyalanmaz, **anlam ve layout birebir** hedeflenir.

**Mevcut durum:** Önceki “inceleme” çoğunlukla curl + route eşlemesiydi; **authenticated UI gözlemlenmedi**. Cortex Plus arayüzü generic shadcn şablonu — bu plan audit + uygulama için tek kaynak olacak.

---

## 1. Başarı kriterleri

| Kriter | Ölçüm |
|--------|--------|
| Sayfa kapsamı | Astra’daki her public + app route için Cortex karşılığı veya bilinçli `N/A` kaydı |
| Etkileşim | Her tıklanabilir öğe (CTA, tab, menü, modal, form, upload) için **before → after** kanıt |
| Görsel parity | Section sırası, grid, tipografi ölçeği, renk rolü (primary/surface), boşluk — screenshot diff checklist |
| Davranış parity | Aynı aksiyon aynı sonucu üretir (yönlendirme, modal, stream, dosya, paywall, toast) |
| Durum parity | Guest / free / premium farkları Astra ile aynı yerde kilit/açık |
| Cortex farkı | Yalnızca “Astra” → “Cortex Plus”, `astra-ai.co` → `cortexplus.app`, özgün logo asset |

---

## 2. Domain ve kullanıcı durumları

| Durum | Astra domain | Cortex hedef |
|-------|--------------|--------------|
| **Guest (A)** | `astra-ai.co/tr/*`, app’te login/pay/legal | `cortexplus.app` marketing + `/giris` `/kayit` `/fiyatlandirma` |
| **Free (B)** | `app.astra-ai.co/tr-TR/*` (ücretsiz hesap) | Aynı route haritası app shell altında |
| **Premium (C)** | Astra AI Plus aboneliği aktif hesap | Cortex Plus paket/abonelik aktif |

**Test hesapları (senin tarafında):**

- `free@test` veya mevcut ücretsiz Astra hesabı — **B**
- Plus/premium Astra hesabı — **C**
- Ödeme/iptal/abonelik değiştirme: **unsafe-to-test** (sadece UI gözlemi, gerçek charge yok)

**Oturum protokolü:** Otomasyon giriş ekranına kadar gider → **sen giriş yaparsın** → “devam” dersin → otomasyon kaldığı yerden tüm tuşları tarar.

---

## 3. Audit yöntemi (her faz)

### 3.1 Araçlar

- Chrome + CDP (browser-use): tıklama, scroll, snapshot, screenshot
- Kayıt: `docs/astra-audit/evidence/{phase}/{route-slug}/`
  - `01-initial.png`, `02-after-click-{id}.png`
  - `interaction.jsonl` (satır başına bir aksiyon)
  - `notes.md` (metin, süre, hata)

### 3.2 Interaction kayıt şablonu (`interaction.jsonl`)

```json
{"id":"hero-cta-1","role":"button","label":"ÜCRETSİZ DENE","page":"/tr/","state":"guest","action":"click","result":"navigate","target":"/tr-TR/onboarding","premium_gate":false,"produces":null}
{"id":"chat-send","role":"button","label":"Gönder","page":"/tr-TR/...","state":"free","action":"click","result":"stream","target":null,"premium_gate":false,"produces":"assistant_message_delta"}
```

### 3.3 Her sayfa için zorunlu alanlar

1. URL (Astra) + Cortex mapping  
2. Viewport: desktop 1536×900 + mobile 390×844  
3. Tüm `link`, `button`, `tab`, `menuitem`, file input, combobox  
4. Scroll sonrası lazy section’lar  
5. Modal / drawer / toast / paywall tetikleyicileri  
6. API/network özeti (endpoint adı, 4xx/5xx — **secret/log yok**)

### 3.4 `scope-matrix.csv` genişletme

Mevcut CSV’ye sütunlar eklenecek:

`screenshot_ref`, `interaction_ids`, `layout_sections`, `design_tokens`, `cortex_component`, `parity_status` (pending | matched | gap)

---

## 4. Faz A — Misafir (Guest)

### 4.1 Marketing (`astra-ai.co/tr/`)

**Bilinen route’lar (genişletilecek crawl ile):**

| Route | Öncelik |
|-------|---------|
| `/tr/` | P0 |
| `/tr/sinav-hazirligi` | P0 |
| `/tr/mobil-uygulama` | P1 |
| `/tr/ogretmenler-ve-profesorler-icin` | P1 |
| `/tr/yardim` | P1 |
| `/tr/bize-ulasin` | P1 |
| `/tr/kunye` | P2 |
| Footer sosyal (Instagram, X, TikTok, LinkedIn) | P2 observe only |
| `ugc.astra-ai.co` (Yaratıcı Programı) | P2 → Cortex’te karşılık kararı |

**Ana sayfada tıklanacak gruplar (örnek — audit sırasında tam liste çıkarılır):**

- Header: Logo, Sınav Hazırlığı, Giriş, Ücretsiz dene / Plus satın al  
- Hero CTA’lar: HEMEN DENE, BAŞLA, Plus  
- Ders kartları (Matematik, Fizik, Kimya, …) — her biri tıklanınca ne oluyor  
- Sınav hazırlığı blok CTA  
- Deneme sınavı / sözlü sınav promoları → app deep link  
- Footer: legal, iletişim, künye, mobil indir  

### 4.2 App misafir (`app.astra-ai.co`)

| Route | Aksiyonlar |
|-------|------------|
| `/tr-TR/login` | Google, e-posta alanları, hata mesajları, “şifremi unuttum” |
| `/tr-TR/onboarding` (UTM’li link misafir akışı) | Adım adım — guest redirect davranışı |
| `/tr-TR/pay` | Paket kartları, toggle, CTA (ödeme **başlatılmaz**) |
| `/privacy-policy`, `/terms-conditions` | Scroll, iç linkler |
| `/tr-TR/exam-preps` | Liste, “ders yok mu” CTA |

**Guest çıktısı:** `guest-sitemap.md` + ~150–300 interaction kaydı + design token çıkarımı (Faz 5).

---

## 5. Faz B — Ücretsiz kullanıcı (Free)

**Önkoşul:** Free hesapla giriş (manuel handoff).

### 5.1 Keşif sırası (sidebar / bottom nav crawl)

1. Onboarding tamamlama veya skip davranışı  
2. Ana hub (dashboard / home — Astra’daki gerçek route adı kayda geçer)  
3. AI öğretmen / sohbet: yeni sohbet, konu seçimi, mesaj gönder, stream, stop, regenerate  
4. Görsel soru: upload, limit, paywall  
5. PDF/doküman: upload, işlem durumu, soru sorma  
6. Quiz / flashcard / deneme: oluştur, aç, cevapla, sonuç ekranı  
7. Sınav hazırlığı / exam-preps  
8. Profil, ayarlar, dil  
9. Bildirimler  
10. Kredi / limit / “Plus’a geç” yüzeyleri  

### 5.2 Paywall ve limit testleri (free)

- Kotayı tüketen aksiyonlar → modal/sheet metni, kapatma, “devam et”  
- Premium kilitli menü öğeleri → tıklanınca ne  
- `returnPath` / yarım sohbet korunuyor mu  

### 5.3 Üretim çıktıları kaydı

Her AI aksiyonu için: girdi türü, süre, UI’da görünen format (LaTeX, adım listesi, kart), hata durumu.

**Free çıktısı:** `free-flows.md` + app route haritası + interaction matrix.

---

## 6. Faz C — Premium (Plus)

**Önkoşul:** Plus aktif hesap.

- Free ile **aynı crawl listesi**; her satırda `premium_gate` ve görünürlük farkı  
- Gelişmiş model / yüksek kota / kilit açık alanlar  
- Abonelik yönetimi ekranı: **görüntüleme OK**, iptal/değiştirme yapılmaz  

**Premium çıktısı:** `premium-delta.md` (sadece B’den farklar).

---

## 7. Faz D — Tasarım sistemi çıkarımı (Astra → Cortex token)

Audit sırasında toplanacak:

| Token | Kaynak |
|-------|--------|
| Renkler | primary, background, card, border, success/warning |
| Tipografi | h1–h4, body, caption, font ailesi |
| Radius, shadow, blur | kart, modal, header |
| Spacing | section padding, container max-width |
| Bileşenler | header, footer, pricing card, chat bubble, input bar, sidebar item, badge, paywall |
| Motion | hover, modal enter, skeleton |

**Cortex uygulaması:** `cortex-plus/src/styles/astra-parity/` (token CSS) + `components/parity/*` — shadcn default theme **kaldırılır**, parity token **default** olur.

---

## 8. Faz E — Cortex Plus uygulama (audit bittikten sonra)

### E1 — Altyapı (1–2 gün)

- [ ] `parity-audit` branch  
- [ ] Design token + font + global layout wrapper  
- [ ] Route guard: guest / free / premium (mevcut Supabase + paketler)

### E2 — Marketing parity (P0)

- [ ] `/` = Astra `/tr/` section-for-section  
- [ ] `/sinav-hazirligi`, `/fiyatlandirma`, `/giris`, `/kayit`  
- [ ] Legal: `/gizlilik`, `/kullanim-kosullari`, `/kvkk`  
- [ ] Header/footer birebir davranış  

### E3 — App shell parity (P0)

- [ ] Login/onboarding akışı  
- [ ] Nav yapısı (sidebar/bottom — Astra ne kullanıyorsa)  
- [ ] `/ogretmen` sohbet UI (mesaj listesi, composer, streaming)  

### E4 — Öğrenme modülleri (P0)

- [ ] Soru çöz / görsel  
- [ ] Dokümanlar + RAG durumu UI  
- [ ] Quiz, flashcard, deneme, çalışma planı, exam-preps  

### E5 — Monetization parity (P0)

- [ ] Paywall modalları (free)  
- [ ] `/paketler` + PayTR akışı = Astra pay ekranı davranışı  

### E6 — Admin/öğretmen (P1)

- [ ] Astra’da varsa öğretmen yüzeyleri; yoksa `N/A`  

### E7 — QA

- [ ] `parity-checklist.md`: her `interaction.jsonl` satırı için Cortex’te tekrar  
- [ ] Playwright: kritik guest + free smoke  
- [ ] Visual regression (optional): Percy/Chromatic veya screenshot diff  

---

## 9. Riskler ve kurallar

| Risk | Önlem |
|------|--------|
| Ödeme / abonelik iptali | UI only, test kartı yok |
| Hesap silme / e-posta değişikliği | Dokunulmaz |
| Rate limit / OpenAI maliyeti | Audit’te kısa fixture mesajları |
| Telif | Layout + UX parity; Astra logo/asset/metin birebir kopya yok — Cortex adı |
| Supabase dashboard blank | Auth URL ayarı kullanıcı handoff |

---

## 10. Zamanlama (öneri)

| Hafta | İş |
|-------|-----|
| 1 | Faz A tam crawl + token çıkarımı |
| 1–2 | Faz B (free) — senin giriş handoff |
| 2 | Faz C (premium delta) |
| 2–3 | E2 marketing + E3 shell |
| 3–4 | E4–E5 modüller + paywall |
| 4 | E7 parity QA |

---

## 11. Hemen başlamak için senden gerekenler

1. **Free** ve **Premium** Astra test hesapları (veya “şu hesap free, şu plus” — şifreleri chat’e yazma; Chrome’da zaten açıksa handoff yeter).  
2. Onay: Audit sırasında **tüm marketing/app tuşlarına** basılması (ödeme hariç).  
3. Öncelik: “Önce app mi marketing mi?” — **öneri: marketing `/tr/` + `/pay` + login, sonra app sohbet** (ilk izlenim + dönüşüm).

---

## 12. Repo dosyaları (oluşturulacak)

```
docs/astra-audit/
  parity-audit-plan.md          ← bu dosya
  guest-sitemap.md              ← Faz A
  free-flows.md                 ← Faz B
  premium-delta.md              ← Faz C
  design-tokens.json            ← Faz D
  parity-checklist.md           ← Faz E7
  evidence/                     ← screenshot + jsonl
  scope-matrix.csv              ← güncellenmiş
```

**Sonraki adım (onayınla):** Faz A crawl’unu başlatıp `guest-sitemap.md` + ilk 50 interaction kaydını doldurmak; ardından sen free giriş yaptıktan sonra Faz B.
