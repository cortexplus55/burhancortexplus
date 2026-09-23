# API bağlantısı öncesi kontrol — 22 Eylül 2026

İncelenen kaynak: `main` / `b5486dabb33a34150f92767d6ddf3b51491adf1e`, tek repo `cortexplus55/burhancortexplus`. Yerel kod ve GitHub main aynı. Bu incelemede ürün kodu, API adresi, anahtarlar, ödeme ayarları veya şema değiştirilmedi.

## Doğrulananlar

- Mevcut sürümde 91 dosyada **973 birim testi geçti**; TypeScript kontrolü geçti. Bu paket saklanan yeni regresyon testlerini içermiyor.
- `acilis-kapisi.mjs` ile 18 kamuya açık adres HTTP 200; sağlık kontrolü doğru Supabase ref'ini (`dgjfyewgrukglsehyntc`) gösteriyor. PostHog yapılandırması canlı istemci paketinde mevcut; bu kontrol paneline olay ulaştığını ayrıca kanıtlamaz.
- Canlı aktif planlar: Plus aylık 599 TL, yıllık 2.990 TL; Sigma aylık 1.999 TL, yıllık 9.990 TL. Plus haftalık 349 TL de aktif. Fiyat sayfası paketleri listeliyor.
- `pdf_learning_v2` canlıda açık. Ayrıntılı PDF'nin 21 Eylül kontrolü: 20 sayfa, 37 parça, completed; aynı sürüm inceleniyor.
- Salt okunur veritabanı kontrolünde `AUDIO_SYNTHESIZE` kredi kuralı 1, `PRACTICE_EXAM_GENERATE` 5; `model_upgrade_grants` ve `document_page_grants` tabloları erişilebilir. Bu örnekler tüm migration geçmişinin uyumlu olduğu anlamına gelmez.
- Son GitHub CI: build ve birim test işleri başarılı, tarayıcı testleri **37 başarılı / 2 başarısız**. [Çalışma kaydı](https://github.com/cortexplus55/burhancortexplus/actions/runs/35562421561).

## Yarım kalan işler

| Öncelik | Açık iş | Bitmiş sayılması için gereken |
|---|---|---|
| 1 | 35 dosyalık öğrenme/podcast düzeltmesi main'e alınmamış | `04fcd6476c6413c8e278d75fd7a0d4009713b712` saklı çalışmasını güncel kodla seçerek birleştir; test, commit, yayın ve canlı kontrolü tamamla. Yeni ses ücretlendirmesi korunmalı. |
| 2 | PDF kaynak kapsamı | Eksik istenen sayfada üretimi durdur; kısaltılmış metni tam kaynak gibi sunma; devam sayfalarının doğru konuya bağlandığını ve kavramlarının işlendiğini doğrula. |
| 3 | Yenilemede öğrenme kaydı | Ders adımı, yanlış tekrar kuyruğu, çözümün görülmesi, ipucu ve eğitmen yardımını koru. Yardımlı cevap bağımsız başarı sayılmamalı. |
| 4 | Konu gezinmesi ve arayüz | Eski planlarda gerçek konu sayısını göster; seçilen konudan ilgisiz etkinliğe geçişi engelle; eski dersin “Dersi bitir” eylemini bağla; biten yolun çıkışını ve mobil görünümü doğrula. |
| 5 | Podcast bütünlüğü ve doğrulama | 112 satıra kadar izin veren senaryonun 60 satırda kesilmesini gider; anlamsal denetimde reddedilen taslak sezgisel kontrolden geçerek kabul edilmemeli. |
| 6 | Kalite ölçümünün güvenilirliği | Kaldırılmış API'yi çağıran PDF kapsam betiklerini güncelle; sıfır ders ölçümünde yeşil başarı verme. Yeni aynı-PDF ders/soru/takip/ses testlerini gerçek üretimle yap. |
| 7 | Tarayıcı testleri | Eski ana sayfa başlığı beklentisini güncelle. Mobil Plus testini veri ve arayüz katmanlarını ayırarak düzelt: mevcut CI sahte veritabanı anahtarı kullanıyor, fiyat sayfası ise canlı plan sorgusuna bağlı. Başarısızlığı doğrudan canlı mobil arızası sayma. |
| 8 | Canlı işletim kabulü | PayTR canlı/test kipini yönetim panelinden gör; gerçek alım/iade kanıtını, kayıt→doğrulama e-postası→uygulama zincirini ve gerçek sesli giriş akışını tamamla. |
| 9 | Bakım ve bağlantı kayıtları | Migration geçmişi hizalaması ve geri yüklenebilir yedek kanıtı güncel olarak doğrulanmalı. Eski teslim belgelerinde kaldırılmış paneller ve yanlış Vercel proje adı var; güncel AGENTS.md esas alınmalı. |

İlk altı maddenin önemli kısmı için kod ve testler saklı çalışmada hazır; güncel main'e entegre edilmiş veya yayımlanmış değiller. Ayrıntı: [21 Eylül son değerlendirmesi](./TRIGONOMETRY-PDF-COMPARISON-2026-09-07.md).

## 22 Eylül — kullanıcı seçimiyle 2. madde

`88bfa90312452309f56df3729f43c3b578036627` ile PDF kaynak okuma ve devam sayfası düzeltmeleri seçilerek güncel main'e alındı ve GitHub'a gönderildi. Diğer saklı dosyalar bu değişikliğe dahil edilmedi. Eksik sayfada durma, kısaltmayı açıkça belirtme, fiziksel sıraya göre konu eşleştirme ve eklenen sayfalardan kaynak özetini yenileme testleri geçti. Toplam 93 dosyada 1.001 test; tip kontrolü ve üretim derlemesi başarılı.

Canlı veritabanındaki 20 sayfalık PDF'nin 7 belge konusundaki sayfalar yeni okuyucuyla salt okunur olarak kontrol edildi; olmayan sayfa reddedildi. Bu, eski konu haritasının anlamsal doğruluğunu veya yeni model çıktısının kalitesini kanıtlamaz. Eski haritada elle düzenlenmiş başlık ve geniş sayfa eşleşmeleri var; kullanıcıya eski çalışmayı koruyarak ayrı kopya oluşturma ile mevcut haritayı yenileme seçenekleri soruldu. Ayrıntı: [Madde 2 doğrulama kaydı](./PDF-KAYNAK-DOGRULAMA-2026-09-22.md).

**Yayın doğrulandı:** [Vercel üretim yayını](https://vercel.com/cortexplus55/burhancortexplus-app/9hUtNKeF1u8z9KYJyqoVFB4M56d2) `Ready`, kaynak `88bfa90`, alan adı `cortexplus.app`. GitHub Vercel durumu başarılı; canlı `/api/health` ve `/giris` HTTP 200, sağlık yanıtında doğru Supabase ref'i. [Bu sürümün CI kaydı](https://github.com/cortexplus55/burhancortexplus/actions/runs/35690648856): birim test işi başarılı; tarayıcı testlerinde aynı iki hata, 37 başarılı / 2 başarısız. Oturum gerektiren canlı öğrenci akışı bu turda yeniden çalıştırılmadı.

## Yeni API için netleşmesi gerekenler

Hizmet adı ve URL bu konuşmada henüz verilmedi. Bu nedenle mevcut çalışan servis başka bir adrese yönlendirilmedi.

**Yapay zekâ API'siyse:** sistem OpenAI istemcisini sohbet, yapılandırılmış ders/quiz üretimi, bağımsız doğrulama, görsel okuma, belge araması için embedding, moderasyon, konuşmayı metne çevirme ve seslendirmede kullanıyor. Kullanılan SDK `OPENAI_BASE_URL` ortam değişkenini destekliyor; yerel kopyada bu değişken yok. Yeni adresin yalnızca sohbet desteklemesi diğer görevlerin çalışacağı anlamına gelmez. Sağlayıcının desteklediği uçlar, modeller, JSON/akış biçimleri, zaman aşımı ve kullanım ölçümü tek tek eşleştirilmeli. Tek bir adres değişikliği bütün bu istemcileri etkileyebilir.

**PayTR API'siyse:** mevcut iFrame ödeme bağlantısının anahtar ve kip kontrolleri, geri çağrı, kredi/abonelik açılması ve iade akışı doğrulanmalı. Otomatik yenileme kodda bilinçli kapalı; PayTR'nin yazılı yanıtı beklenen ayrı ürün kararı. API anahtarı eklemek otomatik yenilemeyi tek başına açmaz.

Yerel `.env.local` içinde OpenAI, Supabase ve SMTP değerleri mevcut; PayTR üçlüsü ile Redis bağlantı değerleri yok. Bu **yerel ortam bulgusu**; Vercel'de eksik oldukları sonucu çıkarılmadı. Canlı fiyat sayfasında ödeme kurulumu bekleniyor uyarısının görünmemesi de canlı tahsilatı kanıtlamaz.

## Sonraki adım

Önce API'nin hizmeti, temel URL'si ve hangi görevlerde kullanılacağı netleştirilecek. Aynı projede başka editör/ajan aktifse birleştirme sırası belirlenecek. Ardından saklanan düzeltmeler güncel ücretlendirmeyi koruyarak birleştirilecek ve yeni API ile gerçek üretim testleri yapılacak. Anahtarlar konuşma veya kaynak koduna yazılmadan, sunucu ayarlarında tutulacak.
