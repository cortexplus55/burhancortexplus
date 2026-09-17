import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import type { StudentAccountContext } from "@/lib/student/account-context";

/**
 * Mobil düzen denetimi için önizleme — YALNIZCA GELİŞTİRMEDE.
 *
 * Neden var: öğrenci ekranlarının 55'i oturum istiyor ve oturumsuz bir
 * denetimde hepsi `/giris`'e yönlüyor. Yani mobilde bozulan asıl yüzeyler
 * hiç ölçülemiyordu; elde yalnızca pazarlama sayfaları kalıyordu.
 *
 * Neden kimlik doğrulama bypass'ı DEĞİL: ödeme alan bir uygulamada auth
 * yoluna dev bayrağı eklemek, ölçüm kolaylığı için alınacak bir risk değil.
 * Bu sayfa auth'a hiç dokunmuyor — gerçek kabuğu (`ParitySorShell`) ve
 * ekranların gerçek sınıflarını sahte veriyle çiziyor. Mobil hatalar
 * kabukta ve CSS'te yaşıyor, veri katmanında değil.
 *
 * Üretimde erişilemez: `notFound()`. Bekçi test bunu tutuyor.
 */

const account = (over: Partial<StudentAccountContext> = {}): StudentAccountContext => ({
  balance: 1240,
  freeAllowanceRemaining: 2,
  isPremium: false,
  subscriptionBadge: null,
  subscriptionAllowance: null,
  canSpend: true,
  resetsAtLabel: "18 Eylül 2026 03:00",
  periodKind: "daily",
  ...over,
});

/* Mobilde düzeni kıran gerçek içerik: uzun Türkçe kelime, uzun sayı, uzun bağlantı. */
const LONG_WORD = "muvaffakiyetsizleştiricileştiriveremeyebileceklerimizden";
const LONG_URL = "https://cortexplus.app/deneme-sinavlari/8f21c4a9-7b3d-4e15-9c02-ab77de441f60/ders/adim-4";

function ContentBlocks() {
  return (
    <>
      <SectionCard
        title="Uzun başlıklar ve kırılmayan kelimeler burada sınanıyor"
        description="Bir kartın açıklaması iki satırı aştığında ve içinde kırılamayan uzun bir kelime olduğunda mobilde ne oluyor?"
      >
        <p>{LONG_WORD}</p>
        <p>
          <a href={LONG_URL}>{LONG_URL}</a>
        </p>
      </SectionCard>

      <SectionCard title="Limit çubukları" description="Sayılar büyüdüğünde başlık satırı taşıyor mu?">
        <div className="cp-limit-row">
          <div className="cp-limit-head">
            <span>Günlük ücretsiz hakkın</span>
            <strong>1.234.567 / 9.876.543</strong>
          </div>
          <div
            className="cp-limit-track"
            role="progressbar"
            aria-valuenow={42}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="cp-limit-fill" style={{ width: "42%" }} />
          </div>
          <p>Hakkın her gün 03:00&apos;te yenileniyor; bekleyerek de çözülüyor.</p>
        </div>
      </SectionCard>

      <SectionCard title="Düğmeler ve dokunma hedefleri" description="Hepsi parmakla rahat basılabiliyor mu?">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="cp-btn">
            Kaydet
          </button>
          <button type="button" className="cp-btn cp-btn--ghost">
            Vazgeç
          </button>
          <button type="button" className="cp-btn">
            Çok uzun bir düğme yazısı da olabilir
          </button>
          <button type="button" aria-label="Sil" className="cp-icon-btn">
            ×
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Form satırı" description="Etiket ve alan dar ekranda üst üste biniyor mu?">
        <label className="grid gap-1 text-sm">
          <span>Sınav adı</span>
          <input
            className="w-full rounded-lg border border-[var(--cs-border)] bg-transparent px-3 py-2"
            placeholder="Örnek: TYT Matematik deneme 3"
          />
        </label>
      </SectionCard>
    </>
  );
}

export default function MobilOnizlemePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <ParitySorShell
      userInitial="B"
      avatarEmoji={null}
      streak={7}
      account={account()}
      recentConversations={[
        { id: "1", title: "Türev alma kuralları ve zincir kuralı örnekleri", updatedAt: new Date().toISOString() },
        { id: "2", title: LONG_WORD, updatedAt: new Date().toISOString() },
      ]}
    >
      <div className="cp-page">
        <div className="cp-page-head">
          <h1 className="cp-page-title">Mobil önizleme</h1>
          <p className="cp-page-hint">
            Bu sayfa yalnızca geliştirmede var. Gerçek kabuk ve gerçek sınıflar, mobili kıran içerikle.
          </p>
        </div>
        <ContentBlocks />
      </div>
    </ParitySorShell>
  );
}
