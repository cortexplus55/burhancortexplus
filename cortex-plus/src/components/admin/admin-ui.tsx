import { AlertTriangle, Info } from "lucide-react";

/** Durum rozeti. Renk anlamı taşıyor: yeşil olan, sarı bekleyen, kırmızı sorunlu. */
export function AdminBadge({
  tone = "mute",
  children,
}: {
  tone?: "ok" | "warn" | "bad" | "gold" | "mute";
  children: React.ReactNode;
}) {
  return <span className={`adm-badge adm-badge--${tone}`}>{children}</span>;
}

export function AdminCard({
  title,
  desc,
  actions,
  children,
  bodyless = false,
}: {
  title?: string;
  desc?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Tablo gibi kenardan kenara duran içerik için iç boşluğu kaldırır. */
  bodyless?: boolean;
}) {
  return (
    <section className="adm-card">
      {title ? (
        <div className="adm-card-head">
          <div>
            <h2 className="adm-card-title">{title}</h2>
            {desc ? <p className="adm-card-desc">{desc}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {bodyless ? children : <div className="adm-card-body">{children}</div>}
    </section>
  );
}

/**
 * Uyarı kutusu. Riskli sayfalarda ne olacağını önceden söylüyor — düğmeye
 * bastıktan sonra öğrenmek geç oluyor.
 */
export function AdminNote({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={`adm-note adm-note--${tone}`}>
      <Icon className="h-4 w-4" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function AdminEmpty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="adm-empty">
      <p className="adm-empty-title">{title}</p>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** Kenardan kenara tablo; dar ekranda yatay kayıyor, sayfayı kaydırmıyor. */
export function AdminTableFrame({
  columns,
  children,
}: {
  columns: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
