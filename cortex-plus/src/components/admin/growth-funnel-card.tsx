import { AdminCard, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { formatNumber } from "@/lib/format";
import { FUNNEL_WINDOW_KEYS, FUNNEL_WINDOW_LABEL, stepRate, type FunnelCounts } from "@/lib/admin/funnel-math";
import type { LoadedFunnel } from "@/lib/admin/funnel";

/*
  Günlük ve 7 günlük büyüme hunisi (20 Kasım 2026). Sunucu bileşeni: sayılar `loadGrowthFunnel`'dan gelir,
  burada yalnız çizilir. Okunamayan sayı "okunamadı", paydası sıfır olan yüzde "—".
*/

const DEFINITIONS: { term: string; definition: string }[] = [
  { term: "Kohort", definition: "Pencerede (Türkiye günüyle bugün ya da son 7 gün) hesabı açılan öğrenciler. Her adım bir önceki adımı geçenlerden sayılır; yüzde bir önceki adıma göredir." },
  { term: "Yeni kayıt", definition: "Profili pencerede açılan hesap." },
  {
    term: "İlk hazırlığını kuran",
    definition: "En az bir sınav hazırlığı kurmuş. Çalışma Stüdyosu'nun geçici yazılı deneme kaydı ve \"Hedef puan\" kaydı hazırlık sayılmaz; silinen hazırlık sayılmaz.",
  },
  {
    term: "1. üniteyi tamamlayan",
    definition: "Hazırlıklarından birinin 1. konusunun (konu listesindeki ilk konu) konu anlatımı adımını en az bir kez bitirmiş. Konu testi ve öbür adımlar bu sayıya girmez.",
  },
  {
    term: "Ödemeyi başlatan",
    definition: "PayTR ödeme ekranı açılmış (ödeme oturumu kurulmuş). Ödeme sayfası ziyareti sunucuda kaydedilmiyor: sayfayı açıp paket seçmeden çıkan sayılamaz.",
  },
  { term: "Başarılı satış", definition: "Ödemesi kesinleşmiş; iade edilen sayılmaz. Veli ödemesinde sayılan kişi, hakkın tanımlandığı öğrencidir." },
];

function Cell({ count, rate }: { count: number | null; rate?: number | null }) {
  if (count == null) return <td className="adm-num text-[var(--adm-muted)]">okunamadı</td>;
  return (
    <td className="adm-num">
      {formatNumber(count)}
      {rate !== undefined ? (
        <span className="block text-xs text-[var(--adm-muted)]">{rate == null ? "—" : `%${rate} önceki adımdan`}</span>
      ) : null}
    </td>
  );
}

function CountRow({ label, counts }: { label: string; counts: FunnelCounts }) {
  return (
    <tr>
      <td>{label}</td>
      {FUNNEL_WINDOW_KEYS.map((key) => (
        <Cell key={key} count={counts[key]} />
      ))}
    </tr>
  );
}

export function GrowthFunnelCard({ funnel }: { funnel: LoadedFunnel }) {
  const signup = funnel.stages.find((stage) => stage.key === "signup");
  const sale = funnel.stages.find((stage) => stage.key === "sale");
  const overall = FUNNEL_WINDOW_KEYS.map((key) => ({
    key,
    rate: stepRate(sale?.counts[key] ?? null, signup?.counts[key] ?? null),
  }));
  const skipped = FUNNEL_WINDOW_KEYS.map((key) => ({ key, count: funnel.skippedPayers[key] })).filter((row) => (row.count ?? 0) > 0);

  return (
    <AdminCard
      id="huni"
      title="Günlük ve 7 günlük büyüme hunisi"
      desc="Kohort hunisi: pencerede kayıt olan öğrencilerin kaçı her adıma ulaştı. Her adım bir öncekini geçenlerden sayılır, yüzde bir önceki adıma göredir. Türkiye günüyle; yalnız okunur."
      bodyless
    >
      {funnel.failed.length ? (
        <div className="px-5 pt-4">
          <AdminNote tone="warn">Şu kaynaklar okunamadı, ilgili sayılar boş: {funnel.failed.join(", ")}.</AdminNote>
        </div>
      ) : null}
      {funnel.truncated.length ? (
        <div className="px-5 pt-4">
          <AdminNote tone="warn">Satır sınırına takıldı, sayı eksik olabilir: {funnel.truncated.join(", ")}.</AdminNote>
        </div>
      ) : null}

      <AdminTableFrame columns={["Adım", ...FUNNEL_WINDOW_KEYS.map((key) => FUNNEL_WINDOW_LABEL[key])]}>
        {funnel.stages.map((stage, index) => (
          <tr key={stage.key}>
            <td>
              {index + 1}. {stage.label}
            </td>
            {FUNNEL_WINDOW_KEYS.map((key) => (
              <Cell key={key} count={stage.counts[key]} rate={index === 0 ? undefined : stage.rate[key]} />
            ))}
          </tr>
        ))}
      </AdminTableFrame>
      <p className="px-5 py-3 text-xs text-[var(--adm-muted)]">
        Kayıttan satışa:{" "}
        {overall.map((row, index) => (
          <span key={row.key}>
            {index ? " · " : ""}
            {FUNNEL_WINDOW_LABEL[row.key]} {row.rate == null ? "—" : `%${row.rate}`}
          </span>
        ))}
        {skipped.length ? (
          <>
            {". "}
            1. üniteyi bitirmeden ödeyen kohort üyesi huniye girmez:{" "}
            {skipped.map((row, index) => (
              <span key={row.key}>
                {index ? " · " : ""}
                {FUNNEL_WINDOW_LABEL[row.key]} {formatNumber(row.count ?? 0)}
              </span>
            ))}
          </>
        ) : null}
        .
      </p>

      <div className="border-t border-[var(--adm-line)]">
        <p className="px-5 pt-4 text-sm font-medium">Penceredeki satışlar (kohorttan bağımsız)</p>
        <p className="px-5 pb-2 text-xs text-[var(--adm-muted)]">Pencerede açılan bütün ödemeler; hesabın ne zaman açıldığına bakılmaz.</p>
        <AdminTableFrame columns={["", ...FUNNEL_WINDOW_KEYS.map((key) => FUNNEL_WINDOW_LABEL[key])]}>
          <CountRow label="Ödemeyi başlatan kişi (PayTR ekranı açıldı)" counts={funnel.sales.starters} />
          <CountRow label="Başarılı satış (adet)" counts={funnel.sales.paid} />
          {funnel.sales.byKind.map((row) => (
            <CountRow key={row.kind} label={`· ${row.label}`} counts={row.counts} />
          ))}
          <CountRow label="· Veli ödemesi (velime ödeme bağlantısı ya da veli hesabı)" counts={funnel.sales.parent} />
        </AdminTableFrame>
      </div>

      <details className="border-t border-[var(--adm-line)] px-5 py-3">
        <summary className="cursor-pointer text-xs font-medium">Adımlar nasıl sayılıyor?</summary>
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
