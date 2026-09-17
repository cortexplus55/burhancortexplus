import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { ExplainStudio } from "@/components/learning/studio/explain-studio";
import { FlashcardStudio } from "@/components/learning/studio/flashcard-studio";
import { OralStudio } from "@/components/learning/studio/oral-studio";
import { PodcastStudio } from "@/components/learning/studio/podcast-studio";
import { QuizStudio } from "@/components/learning/studio/quiz-studio";
import { TrueFalseStudio } from "@/components/learning/studio/true-false-studio";
import { WrittenStudio } from "@/components/learning/studio/written-studio";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat/chat-panel";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
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
        {/*
          Ürünün GERÇEK düğme bileşeni kullanılıyor. İlk yazımda
          `cp-btn` diye var olmayan bir sınıf uydurmuştum: düğmeler
          biçimsiz, 24px yüksek çıkıyordu ve denetim bunları "küçük
          dokunma hedefi" diye raporluyordu. Var olmayan bir bileşenin
          ölçümü ürün hakkında hiçbir şey söylemiyor.
        */}
        <div className="flex flex-wrap gap-2">
          <Button type="button">Kaydet</Button>
          <Button type="button" variant="outline">
            Vazgeç
          </Button>
          <Button type="button">Çok uzun bir düğme yazısı da olabilir</Button>
          <Button type="button" size="icon" aria-label="Sil">
            ×
          </Button>
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

/*
  Stüdyo ekranları — kullanıcının adını verdiği "quiz ekranları".

  Yedisi de aynı basit props'u alıyor (`creditCost`, `initialTopic`), yani
  gerçek bileşen burada birebir çiziliyor. Oturum kontrolü
  `src/app/studio/layout.tsx` içinde; burada o katmana hiç girilmiyor,
  yalnızca sunum bileşeni render ediliyor.

  Her biri ayrı adreste ölçülüyor: hepsi tek sayfada olsa biri diğerinin
  düzenini etkiler ve hangi ekranın bozuk olduğu anlaşılmaz.
*/
const STUDIOS = {
  quiz: QuizStudio,
  flashcard: FlashcardStudio,
  podcast: PodcastStudio,
  sozlu: OralStudio,
  yazili: WrittenStudio,
  anlat: ExplainStudio,
  "dogru-yanlis": TrueFalseStudio,
} as const;

export type OnizlemeEkrani = keyof typeof STUDIOS;

export default async function MobilOnizlemePage({
  searchParams,
}: {
  searchParams: Promise<{ ekran?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { ekran } = await searchParams;

  /*
    Sor ekranı (yapay zekâ öğretmeni) — ürünün en çok kullanılan yüzeyi.

    Mesajlar bilerek dolu veriliyor: boş başlangıç ekranı düzenin kolay
    kısmı. Mobilde kırılan şey uzun cevap balonu, kırılamayan bir
    bağlantı, kod bloğu ve bunların altındaki sabit yazma alanı.
  */
  if (ekran === "sor") {
    return (
      <ParitySorShell userInitial="B" avatarEmoji={null} streak={7} account={account()}>
        <ChatPanel
          hasDocuments
          variant="parity"
          greetingLine="Merhaba Burhan"
          greetingSubline="Bugün neyi çalışalım?"
          chatCreditCost={1}
          isPremium={false}
          initialMessages={[
            { role: "user", content: "Zincir kuralını bir örnekle anlatır mısın?" },
            {
              role: "assistant",
              id: "m2",
              content:
                "Zincir kuralı, iç içe fonksiyonların türevini alırken kullanılır. " +
                "f(g(x)) için türev f'(g(x)) · g'(x) olur.\n\n" +
                "Kaynak: " + LONG_URL + "\n\n" +
                "Uzun ve kırılamayan bir örnek: " + LONG_WORD,
            },
            { role: "user", content: LONG_WORD },
          ]}
        />
      </ParitySorShell>
    );
  }

  /*
    Yönetim ekranları. Kendi kabuğunu kullanıyor (`AdminShell`) ve tek
    tablosu bu üründe burada — tablo mobilde yatay taşmanın bir
    numaralı sebebi, o yüzden ayrıca ölçülüyor.
  */
  if (ekran === "admin") {
    return (
      <AdminShell href="/admin/sistem" pendingApplications={3}>
        <AdminNote tone="warn">
          Uzun bir uyarı metni: {LONG_WORD} — dar ekranda kutunun dışına taşıyor mu?
        </AdminNote>
        <AdminCard title="Bağlantılar" desc="Tablo dar ekranda ne yapıyor?" bodyless>
          <AdminTableFrame columns={["Servis", "Ne işe yarar", "Durum"]}>
            <tr>
              <td>
                <div className="font-medium">Supabase</div>
                <div className="text-xs text-[var(--adm-muted)]">NEXT_PUBLIC_SUPABASE_URL</div>
              </td>
              <td className="max-w-md whitespace-normal text-xs text-[var(--adm-muted)]">
                Veritabanı ve oturum. Eksikse hiçbir sayfa açılmaz.
              </td>
              <td>
                <AdminBadge tone="ok">Tanımlı</AdminBadge>
              </td>
            </tr>
            <tr>
              <td>
                <div className="font-medium">{LONG_WORD}</div>
              </td>
              <td className="max-w-md whitespace-normal text-xs text-[var(--adm-muted)]">
                {LONG_URL}
              </td>
              <td>
                <AdminBadge tone="bad">Eksik</AdminBadge>
              </td>
            </tr>
          </AdminTableFrame>
        </AdminCard>
      </AdminShell>
    );
  }

  const Studio = ekran && ekran in STUDIOS ? STUDIOS[ekran as OnizlemeEkrani] : null;

  if (Studio) {
    return (
      <ParitySorShell userInitial="B" avatarEmoji={null} streak={7} account={account()}>
        <Studio creditCost={3} initialTopic="Türev alma kuralları ve zincir kuralı" />
      </ParitySorShell>
    );
  }

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
