# Astra — Ücretsiz katman ve okul ağı (free hesap, 2026-09-03)

## Katman kimliği
- Plan adı: **"Temel"** · alt etiket "Ücretsiz plan"
- Profil kartında **"Daha Hızlı Öğren ✨"** yükseltme butonu
- İsmin yanında **altın Plus rozeti YOK** (premium'da vardı)
- Header'da kalıcı **"Satın al ✨"** CTA'sı (premium'da yok)

## Kota — yapısal fark
| | Free ("Astra AI Free") | Plus ("Astra AI Plus") |
|---|---|---|
| Etiket | "Astra AI Free" | "Astra AI Plus – **Aylık limit**" |
| Sıfırlama | **"3 Eyl 2026 03:00"** → **GÜNLÜK** | "24 Eyl 2026 21:20" → **AYLIK** |
| Gösterim | "%0 kullanıldı" | "%27 kullanıldı" |
| Top-up | **Yok** | **"Ek paket satın al"** var |
| Referans kartı | **Var** (aynı: 0/3 davet, 3 kat / 400 kat) | Var |

→ Free günlük yenilenen küçük bir kova; Plus aylık büyük bir kova + top-up.
→ Referans programı **her iki katmanda da** açık — büyüme motoru ücretsizde de çalışıyor.

---

## EN KRİTİK BULGU: okul içi içerik ağı ücretsizde de tam açık

Free hesabın "Sınavlar → Okulum" sekmesi:

- 🏛️ **İstanbul Üniversitesi** — "Üniversite / fakülte, **1. dönem**"
- Üye avatarları: **A · Z · +315** → **~317 üye**
- **"Sınav hazırlıkları · 70"** → tek okulda **70 paylaşılmış sınav hazırlığı**
- Filtreler: **dönem** ("1. dönem") · **ders** ("Tüm dersler")

Akış kartı yapısı (gerçek kullanıcı içeriği):
`avatar · kullanıcı adı · [POPÜLER rozeti] · ders · başlık · N görüntülenme`

Gözlemlenen ders çeşitliliği: Uluslararası ilişkiler · İngilizce (YDS/YÖKDİL,
B1 dilbilgisi, muafiyet sınavı) · Yönetim ve organizasyon · Kimya · Ekonomi ·
Bilişim (Python) · Halkla İlişkiler · Kişiler arası ilişkiler
Görüntülenme aralığı: 3–17

> Kullanıcı adları gerçek kişilere ait olduğu için bu artefakta liste hâlinde
> kaydedilmedi; yalnızca yapı ve ölçek not edildi.

### Stratejik sonuç
Astra'nın asıl savunma hattı AI özellikleri değil, **üniversite bazlı
kullanıcı üretimi içerik ağı**. Bir öğrenci okuluna kayıt olduğu anda
70 hazır çalışma materyaline erişiyor — bu, hiçbir AI özelliğinin
kopyalayamayacağı bir ağ etkisi.

Ve bu katman **ücretsiz kullanıcıya açık** — kasıtlı: ağ büyümesi
paywall'un önünde tutuluyor. Para, kullanım kotasından kazanılıyor.

**Bizde:** `schools` tablosu var (`api/schools/search` ile arama), ama
okul akışı, paylaşım, görüntülenme, popülerlik rozeti, dönem/ders filtresi yok.
