import { Crown } from "lucide-react";
import { formatNumber } from "@/lib/format";
import {
  formatFounderTime,
  founderActionLabel,
  nominalCost,
  type FounderLedgerRow,
  type FounderUsageSummary,
} from "@/lib/credits/founder-usage";
import "@/styles/founder.css";

export const FOUNDER_CARD_BODY =
  "Bu hesapta hiçbir işlem kredi düşürmez. Harcamalar yalnızca maliyet takibi için 0 kredi olarak kaydedilir.";
export const FOUNDER_EMPTY =
  "Henüz işlem yok. Bir ders ya da quiz oluşturduğunda burada görünecek.";
export const FOUNDER_ERROR = "Kayıtlar şu anda yüklenemedi.";

type Row = FounderLedgerRow & { id: string; created_at: string };

/**
 * Kredi sayfasının kurucu görünümü. Satış kartı, paket ya da "Plus'a geç"
 * yok; bakiye düşmediği için gösterilecek tek şey maliyet takibi.
 */
export function FounderCreditsView({
  summary,
  recent,
  failed,
}: {
  summary: FounderUsageSummary | null;
  recent: Row[];
  failed: boolean;
}) {
  return (
    <div className="cp-exam-page space-y-6">
      <h1 className="cp-founder-title">Krediler</h1>

      <section className="pm-card cp-founder-card" aria-labelledby="founder-card-title">
        <span className="cp-founder-card__badge" aria-hidden>
          <Crown className="h-5 w-5" />
        </span>
        <div>
          <h2 id="founder-card-title" className="cp-founder-card__title">
            Kurucu hesabı
          </h2>
          <p className="cp-founder-card__body">{FOUNDER_CARD_BODY}</p>
        </div>
      </section>

      {failed ? (
        <div className="cp-founder-error" role="alert">
          <p className="m-0">{FOUNDER_ERROR}</p>
          {/* Düz bağlantı: sunucu bileşeni baştan çizilsin, sorgular yeniden gitsin. */}
          <a href="/krediler">Yeniden dene</a>
        </div>
      ) : (
        <>
          <div className="cp-founder-stats">
            <Stat label="Bu ay nominal kullanım" value={`${formatNumber(summary?.nominalTotal ?? 0)} kredi`} />
            <Stat label="Bu ay işlem sayısı" value={formatNumber(summary?.count ?? 0)} />
            <Stat label="En çok kullanılan" value={summary?.topAction ?? "—"} />
          </div>

          <section className="cp-founder-ledger" aria-labelledby="founder-ledger-title">
            <h2 id="founder-ledger-title" className="cp-founder-ledger__title">
              Son işlemler
            </h2>
            {recent.length === 0 ? (
              <p className="cp-founder-empty">{FOUNDER_EMPTY}</p>
            ) : (
              <>
                <table className="cp-founder-table">
                  <thead>
                    <tr>
                      <th scope="col">Tarih</th>
                      <th scope="col">İşlem</th>
                      <th scope="col" className="cp-founder-num">Normal maliyet</th>
                      <th scope="col" className="cp-founder-num">Düşen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <time dateTime={row.created_at}>{formatFounderTime(row.created_at)}</time>
                        </td>
                        <td>{founderActionLabel(row.action_code)}</td>
                        <td className="cp-founder-num">{formatNumber(nominalCost(row.metadata))}</td>
                        <td className="cp-founder-num cp-founder-zero">0</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <ul className="cp-founder-cards">
                  {recent.map((row) => (
                    <li key={row.id}>
                      <div className="cp-founder-cards__head">
                        <span>{founderActionLabel(row.action_code)}</span>
                        <time dateTime={row.created_at}>{formatFounderTime(row.created_at)}</time>
                      </div>
                      <p className="cp-founder-cards__cost">
                        Normal maliyet {formatNumber(nominalCost(row.metadata))} · Düşen{" "}
                        <span className="cp-founder-zero">0</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="cp-founder-stat">
      <p className="cp-founder-stat__label">{label}</p>
      <p className="cp-founder-stat__value">{value}</p>
    </div>
  );
}
