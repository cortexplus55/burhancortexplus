# Astra AI — Premium app UI spec (Faz C, gözlem)

**Oturum:** Premium (Plus/Sigma) — kullanıcı girişi  
**Evidence:** `evidence/phase-c/premium/`, Cursor browser view `aa02c5`  
**Tarih:** 2025-08-25

## Global shell (tüm app sayfaları)

| Bölge | Bileşen | Davranış |
|-------|---------|----------|
| Sol üst | Streak (🔥 + sayı) | Tıklanınca streak/achievement modalları |
| Sağ üst | Profil avatar (harf) | Hesap ayarları (pending crawl) |
| Alt | 3 tab + menü | Sor · Sınavlar · Uygulamalar + 3×3 grid **Menü** |
| Tema | Dark `#~121212` | Pill butonlar, mavi primary `#~4A6CF7` |

### Alt navigasyon → URL (Astra)

| Tab | Route |
|-----|--------|
| Sor | `/` (Yeni sohbet) |
| Sınavlar | `/exam-preps` |
| Uygulamalar | `/lab` |

## Sor (ana sohbet) — `/`

- Karşılama: `{ad}, iyi akşamlar! 🌙` + **Başla** pill
- Ders seçici: **Matematik** (floating pill, dropdown)
- Composer: placeholder `Sor, konuş veya dosya gönder`
- Sol: **+** (dosya), **kamera** (mavi pill)
- Sağ: **mikrofon**, **Konuş** (ses modu)
- Üst tab **Sor** seçili

### Gamification (premium giriş)

- Streak tamamlama modalı → **Devam et**
- Achievement (“İlk Roket açıldı”) → **Hikâyeyi gör** / **Devam et**
- Escape ile kapatılabilir

## Sınavlar — `/exam-preps`

- Arama: **Ara**
- Hero kart: **Sınavlarına AI ile hazırlan**
- CTA: **+ Yeni test oluştur**
- Link: **Nasıl çalışır**
- Segment: **Okulum** | **Astra'dan**
- Okul ekle CTA: **Hangi okula gidiyorsun?**

## Uygulamalar — `/lab`

- Başlık: **Öğrenme uygulamaları**
- 2×2 kategori: Mini oyunlar (11), Simülasyonlar (33), Araçlar (7), Uygulamalarınız (0)
- Filtre: Tümü · Matematik · Fizik · Kimya · Biyoloji · Genel
- **+ Uygulama oluştur**
- Grid: onlarca interaktif app kartı (Renk Modelleri, Grafik, Güneş Sistemi, …)

## Paywall (misafir / upgrade) — `/tr-TR/pay`

Ayrı spec: `evidence/phase-a/app-pay/PAY-UI-SPEC.md`  
Plus **₺770/ay** · Yıllık **₺321/ay** · Sigma **₺2567/ay**

---

## Cortex Plus mapping (uygulama)

| Astra | Cortex route | Durum |
|-------|--------------|--------|
| Sor `/` | `/ogretmen` | **shell + composer (v1)** |
| Sınavlar | `/deneme-sinavlari` | **shell + hero (v1)** |
| Uygulamalar `/lab` | `/uygulamalar` | **hub kartları (v1)** |
| Pay | `/paketler` | **Plus/Sigma UI (v1)** |
| Menü drawer | `/dashboard` (grid) | kısmi |

## Cortex uygulama sırası

1. `AstraMobileShell` + dark theme token  
2. `/ogretmen` composer + karşılama  
3. `/paketler` Astra pay kartları  
4. `/deneme-sinavlari` exam-preps hero  
5. `/uygulamalar` lab hub (link-out)  
6. Menü drawer + profil (audit devam)
