import Link from "next/link";
import { LegalDocument } from "@/components/layout/legal-document";
import { DELETED_DATA, PUBLIC_DELETION_PATH, RETAINED_DATA } from "@/lib/privacy/account-deletion-copy";
import { sellerField } from "@/lib/legal/seller";

export const metadata = {
  title: "Gizlilik politikası",
  description: "Cortex Plus'ın web sitesi ve mobil uygulamasında kişisel verileri işleme ve saklama ilkeleri.",
};

/*
  Gizlilik politikası: web sitesi ve mobil uygulama (App Store / Google Play) için ortak, sade bir liste. Asıl ve
  bağlayıcı metin KVKK Aydınlatma Metni (`kvkk-text.ts`); bu sayfa onunla çelişmesin diye aynı veri ve aynı sağlayıcıları
  sayar (26 Kasım 2026, mağaza uyumluluğu: mağazaların veri beyanı formları bu listeye göre doldurulur,
  `docs/delivery/MAGAZA-UYUMLULUK-KONTROL.md`). Silinen ve saklanan veriler hesap silme ekranlarıyla aynı kaynaktan.
*/
export default function GizlilikPage() {
  return (
    <LegalDocument
      title="Gizlilik politikası"
      description="Bu metin, Cortex Plus web sitesini ve mobil uygulamasını kullanırken verilerinin nasıl işlendiğini açıklar."
      sections={[
        {
          heading: "Veri sorumlusu",
          body: [
            `Cortex Plus'ı ${sellerField("legalName")} (şahıs işletmesi) sunar. İletişim: ${sellerField("email")} · Adres: ${sellerField("address")}`,
          ],
        },
        {
          heading: "Toplanan veriler",
          body: [
            "Hesap bilgileri: ad soyad, e-posta adresi, seçtiğin sınıf, hedef sınav ve sınav tarihin; yazarsan okulun.",
            "Yüklediğin içerik: ders notları, PDF, Word ve sunu dosyaları, defter ve soru fotoğrafları ile bunlardan çıkarılan metin.",
            "Öğrenme kayıtları: öğretmenle sohbetlerin, test ve deneme cevapların, puanların, ilerlemen, yanlışların ve tekrar kartların.",
            "Sesli öğretmen: canlı sesli öğretmende ve sözlü pratikte konuşman gerçek zamanlı olarak yazıya çevrilmek ve cevaplanmak üzere işlenir; ses kaydı saklanmaz, konuşmanın yazılı dökümü sohbetinde kalır.",
            "Ödeme geçmişi: satın aldığın plan, tutar, tarih ve ödemenin durumu. Kart bilgilerin bize gelmez; web sitesinde PayTR, mobil uygulamada App Store ya da Google Play işler.",
            "Bildirim cihaz anahtarı: mobil uygulamada bildirim almayı kabul edersen telefonunun bildirim anahtarı ve türü (iOS ya da Android).",
            "Hata ve güvenlik kayıtları: oturum ve cihaz kayıtları, giriş zamanları ve hata kayıtları (Sentry'ye kişisel veriler ayıklanarak gönderilir).",
            "Kullanım ölçümü: sayfa ve özellik kullanım sayıları yalnız analitik çerezlere izin verirsen toplanır.",
            "Kamera, galeri ve mikrofon yalnız sen kullandığında açılır; uygulama kendiliğinden fotoğraf ya da ses kaydetmez.",
          ],
        },
        {
          heading: "Neden işliyoruz",
          body: [
            "Hesabını açmak, notlarından ders, test, kart, podcast ve çalışma yolu hazırlamak, cevaplarını değerlendirmek, ödemelerini ve aboneliğini yönetmek, destek vermek, kötüye kullanımı önlemek ve yasal yükümlülükleri yerine getirmek için.",
            "Verilerini satmayız, reklam için kullanmayız ve reklam ağlarıyla paylaşmayız. Uygulamada seni başka uygulama ve sitelerde izleyen bir takip yoktur.",
            "Hangi verinin hangi amaçla ve hangi hukuki sebeple işlendiğinin tam listesi KVKK Aydınlatma Metni'ndedir.",
          ],
        },
        {
          heading: "Hizmet aldığımız şirketler",
          body: [
            "OpenAI — ders, test, podcast ve sohbet üretimi, fotoğraf okuma, seslendirme ve konuşmayı yazıya çevirme (ABD). Gönderilen içerik onların modellerini eğitmek için kullanılmaz.",
            "Supabase — veritabanı, dosya depolama ve oturum (Almanya, Frankfurt).",
            "Vercel — web sitesinin ve uygulamanın sunucusu (Almanya, Frankfurt).",
            "Resend ve Google — e-posta gönderimi; Google ile giriş (ABD).",
            "PayTR — web sitesinde ödemenin alınması ve iadesi (Türkiye).",
            "Apple ve Google — mobil uygulamada bildirimlerin telefonuna iletilmesi ve uygulama mağazasından yapılan satın alma (ABD).",
            "RevenueCat — mobil uygulamada mağazadan satın alırsan aboneliğinin hesabına tanımlanması (ABD).",
            "Sentry — hata kayıtları (ABD); Upstash — hız sınırı ve kısa süreli kilit kayıtları; PostHog — yalnız izin verirsen kullanım ölçümü (Avrupa Birliği).",
          ],
        },
        {
          heading: "18 yaşından küçükler",
          body: [
            "18 yaşından küçük kullanıcılar hesabı velilerinin (anne, baba ya da vasi) bilgisi ve izniyle açar; kayıtta bunu beyan eder. Adları sıralamada varsayılan olarak gizlidir ve analitik çerezler izin verilmeden çalışmaz.",
            "Veli, çocuğunun hesabının kapatılmasını ya da verilerinin silinmesini istemek için bize yazabilir.",
          ],
        },
        {
          heading: "Saklama süreleri",
          body: [
            "Verilerin hesabın açık kaldıkça saklanır. Hata kayıtları en çok 90 gün, hız sınırı ve kilit kayıtları dakikalar ya da günler içinde kendiliğinden silinir.",
            ...RETAINED_DATA,
          ],
        },
        {
          heading: "Silme hakkın",
          body: [
            "Hesabını ve verilerini istediğin zaman kalıcı olarak silebilirsin: Ayarlar → Hesabı sil → «Hesabımı kalıcı olarak sil». Uygulamaya giremiyorsan ya da uygulamayı sildiysen Hesap silme sayfasındaki formla e-postanla talep oluşturursun.",
            ...DELETED_DATA.map((item) => `Silinen: ${item}.`),
            "App Store ya da Google Play üzerinden aldığın abonelik hesabını silince kendiliğinden iptal olmaz; aboneliği mağazanın abonelik ayarlarından iptal etmelisin.",
            "KVKK'nın 11. maddesindeki öbür hakların (bilgi isteme, düzeltme, itiraz) ve başvuru yolu KVKK Aydınlatma Metni'nde yazar.",
          ],
        },
        {
          heading: "Güvenlik",
          body: [
            "Dosyalar özel depolamada tutulur ve yalnız kısa ömürlü imzalı bağlantıyla açılır; bağlantılar şifreli (HTTPS) iletilir.",
            "Veritabanı erişimi satır düzeyi güvenlik kurallarıyla kullanıcı bazında sınırlanır; tarayıcıdan yapılabilen yazma işlemleri birkaç tabloyla ve kullanıcının kendi satırlarıyla sınırlıdır.",
            "IP adresi; kötüye kullanım, onay ve çerez tercihi kayıtlarında tek yönlü özet olarak tutulur. Hız sınırı için kısa süreli, ödeme sırasında ise ödeme kuruluşuna ve ödeme onayının kanıt kaydına olduğu gibi kullanılır (ayrıntı KVKK Aydınlatma Metni'nde).",
          ],
        },
      ]}
    >
      <p className="mt-10 text-sm leading-relaxed text-[var(--mk-muted)]">
        Ayrıntılar için{" "}
        <Link href="/kvkk" className="underline underline-offset-4">
          KVKK Aydınlatma Metni
        </Link>
        ,{" "}
        <Link href="/cerez-politikasi" className="underline underline-offset-4">
          Çerez Politikası
        </Link>{" "}
        ve{" "}
        <Link href={PUBLIC_DELETION_PATH} className="underline underline-offset-4">
          Hesap silme
        </Link>
        .
      </p>
    </LegalDocument>
  );
}
