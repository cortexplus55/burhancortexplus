import { AdminCard, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { WINDOW_KEYS, WINDOW_LABEL } from "@/lib/admin/cockpit-math";
import type { LoadedVoiceCockpit } from "@/lib/admin/voice-cockpit";
import type { VoiceCount, VoiceMoney } from "@/lib/admin/voice-cockpit-math";
import { formatNumber } from "@/lib/format";

/*
  Kokpitte "Canlı sesli öğretmen" kartı (21 Kasım 2026). Sunucu bileşeni: sayılar `loadVoiceCockpit`'ten, burada yalnız
  çizilir. Okunamayan sayı "okunamadı". Yalnız okur.
*/

const DEFINITIONS: { term: string; definition: string }[] = [
  {
    term: "Sesli dakika",
    definition:
      "Ödenen dakikalar (başlayan dakika ödenir; ilk 5 saniyesi dolmadan biten dakika iade edilir, sayılmaz) ve her ücretsiz deneme için bir dakika.",
  },
  { term: "Oturum", definition: "İlk dakikası ödenmiş sesli ders ve bağlantısı kurulmuş ücretsiz deneme." },
  {
    term: "Gerçek maliyet",
    definition: "OpenAI'nin ses, metin ve görsel kullanımı; kullanım kayıtları ile model fiyat tablosundan. Öğrenciden düşen kredi değil.",
  },
  { term: "Denemeyi kullanan", definition: "Pencerede 1 dakikalık ücretsiz denemeyi açan farklı öğrenci." },
  {
    term: "Denemeden sonra Plus'a geçen",
    definition:
      "Denemesinden sonraki ilk başarılı paket ödemesi (Plus, Sınav Haftası ya da Sigma; ek paket sayılmaz) pencerede olan öğrenci. Veli ödemesinde sayılan kişi hakkın sahibi öğrencidir. Denemeler 120 gün geriye okunur.",
  },
];

function usd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function CountRow({ label, counts }: { label: string; counts: VoiceCount }) {
  return (
    <tr>
      <td>{label}</td>
      {WINDOW_KEYS.map((key) => (
        <td key={key} className={counts[key] == null ? "adm-num text-[var(--adm-muted)]" : "adm-num"}>
          {counts[key] == null ? "okunamadı" : formatNumber(counts[key] as number)}
        </td>
      ))}
    </tr>
  );
}

function MoneyRow({ label, values, minutes }: { label: string; values: VoiceMoney; minutes: VoiceCount }) {
  return (
    <tr>
      <td>{label}</td>
      {WINDOW_KEYS.map((key) => {
        const value = values[key];
        const count = minutes[key];
        return (
          <td key={key} className={value == null ? "adm-num text-[var(--adm-muted)]" : "adm-num"}>
            {value == null ? "okunamadı" : usd(value)}
            {value != null && count ? (
              <span className="block text-xs text-[var(--adm-muted)]">dakikası {usd(value / count)}</span>
            ) : null}
          </td>
        );
      })}
    </tr>
  );
}

export function VoiceTutorCard({ voice }: { voice: LoadedVoiceCockpit }) {
  const unpriced = WINDOW_KEYS.map((key) => voice.unpriced[key] ?? 0).reduce((max, value) => Math.max(max, value), 0);
  return (
    <AdminCard
      id="sesli-ders"
      title="Canlı sesli öğretmen"
      desc="Öğretmenle sesli konuşma: dakika, oturum, gerçek gider ve ücretsiz denemeden Plus'a geçiş. Türkiye günüyle; yalnız okunur."
      bodyless
    >
      {voice.failed.length ? (
        <div className="px-5 pt-4">
          <AdminNote tone="warn">Şu kaynaklar okunamadı, ilgili sayılar boş: {voice.failed.join(", ")}.</AdminNote>
        </div>
      ) : null}
      {voice.truncated.length ? (
        <div className="px-5 pt-4">
          <AdminNote tone="warn">Satır sınırına takıldı, sayı eksik olabilir: {voice.truncated.join(", ")}.</AdminNote>
        </div>
      ) : null}
      {unpriced ? (
        <div className="px-5 pt-4">
          <AdminNote tone="warn">
            {formatNumber(unpriced)} kullanım kaydının modeli fiyat tablosunda yok; gider o kadar eksik. Sesli ders fiyat satırları göçle eklenir.
          </AdminNote>
        </div>
      ) : null}
      <AdminTableFrame columns={["", ...WINDOW_KEYS.map((key) => WINDOW_LABEL[key])]}>
        <CountRow label="Sesli dakika" counts={voice.minutes} />
        <CountRow label="Oturum" counts={voice.sessions} />
        <MoneyRow label="Gerçek maliyet (OpenAI)" values={voice.costUsd} minutes={voice.minutes} />
        <CountRow label="Denemeyi kullanan öğrenci" counts={voice.trialUsers} />
        <CountRow label="Denemeden sonra Plus'a geçen" counts={voice.convertedAfterTrial} />
      </AdminTableFrame>
      <details className="border-t border-[var(--adm-line)] px-5 py-3">
        <summary className="cursor-pointer text-xs font-medium">Sayılar nasıl hesaplanıyor?</summary>
        <dl className="mt-2 space-y-1.5 text-xs text-[var(--adm-muted)]">
          {DEFINITIONS.map((row) => (
            <div key={row.term}>
              <dt className="inline font-medium text-[var(--adm-text)]">{row.term}: </dt>
              <dd className="inline">{row.definition}</dd>
            </div>
          ))}
        </dl>
      </details>
    </AdminCard>
  );
}
