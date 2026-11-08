import Link from "next/link";
import { Search } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatNumber } from "@/lib/format";
import {
  ACTIVITY_CATEGORIES,
  istanbulDayLabel,
  istanbulTime,
  parseCategory,
  parseWindow,
  summarize,
  WINDOW_OPTIONS,
  type ActivityCategory,
  type ActivityEvent,
} from "@/lib/admin/activity-feed";
import { FEED_LIMIT, loadActivity } from "@/lib/admin/activity-load";

export const metadata = { title: "Yönetim · Kullanıcı Etkinlikleri" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORY_TONE: Record<ActivityCategory, "ok" | "warn" | "bad" | "gold" | "mute"> = {
  giris: "mute",
  calisma: "ok",
  hazirlik: "ok",
  belge: "mute",
  "yapay-zeka": "mute",
  deneme: "ok",
  odeme: "gold",
  destek: "warn",
};

const WINDOW_LABEL: Record<number, string> = { 1: "Son 24 saat", 7: "Son 7 gün", 30: "Son 30 gün" };

function href(params: { gun?: number; tur?: string | null; kim?: string | null }) {
  const query = new URLSearchParams();
  if (params.gun && params.gun !== 7) query.set("gun", String(params.gun));
  if (params.tur) query.set("tur", params.tur);
  if (params.kim) query.set("kim", params.kim);
  const text = query.toString();
  return text ? `/admin/etkinlik?${text}` : "/admin/etkinlik";
}

/**
 * Kullanıcı etkinlikleri (8 Kasım 2026, ürün sahibinin isteği): kim ne zaman girdi, ne yaptı. Giriş oturumları, yol
 * etkinlikleri (açtı / bitirdi ve puanı), hazırlık, belge, sohbet ve araçlar, deneme sınavı, ödeme ve abonelik,
 * destek ve geri bildirim tek akışta. İçerik (mesaj, belge metni, cevap) gösterilmez.
 */
export default async function AdminEtkinlikPage({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string; tur?: string; kim?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  const days = parseWindow(params.gun);
  const category = parseCategory(params.tur);
  const term = (params.kim ?? "").trim();
  const service = createServiceClient();
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

  // Kişi: kimlik ya da ad / e-posta araması. Birden çok eşleşmede seçim listesi gösterilir.
  let userId: string | null = null;
  let matches: { id: string; name: string; email: string | null }[] = [];
  if (term && UUID.test(term)) {
    userId = term;
  } else if (term) {
    const needle = term.toLocaleLowerCase("tr");
    const [{ data: byName }, auth] = await Promise.all([
      service.from("profiles").select("id, full_name").ilike("full_name", `%${term.replace(/[%_,()]/g, " ")}%`).limit(20),
      service.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch(() => null),
    ]);
    const emails = new Map<string, string>();
    for (const user of auth?.data?.users ?? []) if (user.email) emails.set(user.id, user.email);
    const found = new Map<string, { id: string; name: string; email: string | null }>();
    for (const row of byName ?? []) {
      found.set(String(row.id), { id: String(row.id), name: String(row.full_name ?? "Adı yok"), email: emails.get(String(row.id)) ?? null });
    }
    for (const [id, email] of emails) {
      if (email.toLocaleLowerCase("tr").includes(needle) && !found.has(id)) found.set(id, { id, name: email, email });
    }
    matches = [...found.values()].slice(0, 20);
    if (matches.length === 1) userId = matches[0]!.id;
  }

  const [pending, result] = await Promise.all([
    countPendingApplications(service),
    term && !userId ? Promise.resolve(null) : loadActivity(service, { sinceIso, userId, category }),
  ]);
  const events = result?.events ?? [];
  const summary = summarize(events);
  const person = userId ? result?.names.get(userId) : null;

  const byDay: { day: string; events: ActivityEvent[] }[] = [];
  for (const event of events) {
    const day = istanbulDayLabel(event.at);
    const last = byDay[byDay.length - 1];
    if (last?.day === day) last.events.push(event);
    else byDay.push({ day, events: [event] });
  }

  const tiles = [
    { label: "Aktif kullanıcı", value: summary.activeUsers },
    { label: "Giriş", value: summary.logins },
    { label: "Biten etkinlik", value: summary.completed },
    { label: "Sohbet ve araç işlemi", value: summary.aiActions },
    { label: "Yüklenen belge", value: summary.uploads },
    { label: "Ödeme", value: summary.paid },
  ];

  return (
    <AdminShell href="/admin/etkinlik" pendingApplications={pending}>
      <AdminNote tone="info">
        Kim, ne zaman girdi ve ne yaptı. Yalnız işlemin kendisi görünür; mesaj, belge ve cevap içeriği gösterilmez.
        {` ${WINDOW_LABEL[days]}, en çok ${formatNumber(FEED_LIMIT)} olay; saatler Türkiye saati.`}
      </AdminNote>

      <AdminCard
        title={person ? `${person.name}${person.email ? ` · ${person.email}` : ""}` : "Bütün kullanıcılar"}
        desc={category ? `Yalnız: ${ACTIVITY_CATEGORIES.find((c) => c.id === category)?.label}` : "Bütün işlem türleri"}
        actions={
          <form method="get" className="flex flex-wrap gap-2">
            <input
              type="search"
              name="kim"
              defaultValue={term}
              placeholder="İsim ya da e-posta"
              aria-label="Kullanıcı ara"
              className="adm-input"
            />
            <select name="gun" defaultValue={String(days)} aria-label="Zaman aralığı" className="adm-input">
              {WINDOW_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {WINDOW_LABEL[option]}
                </option>
              ))}
            </select>
            <select name="tur" defaultValue={category ?? ""} aria-label="İşlem türü" className="adm-input">
              <option value="">Bütün işlemler</option>
              {ACTIVITY_CATEGORIES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="submit" className="adm-btn">
              <Search className="h-3.5 w-3.5" aria-hidden />
              Göster
            </button>
            {term || category || days !== 7 ? (
              <Link href="/admin/etkinlik" className="adm-btn">
                Temizle
              </Link>
            ) : null}
          </form>
        }
      >
        {person && userId ? (
          <p className="mb-3 text-sm">
            <Link href={`/admin/kullanicilar/${userId}`} className="underline">
              Hesabı aç
            </Link>
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border border-[var(--adm-line)] p-3">
              <div className="text-xs text-[var(--adm-muted)]">{tile.label}</div>
              <div className="adm-num text-xl font-semibold">{formatNumber(tile.value)}</div>
            </div>
          ))}
        </div>
      </AdminCard>

      {term && !userId ? (
        <AdminCard title="Kimi görmek istiyorsun?" desc={matches.length ? `"${term}" için ${matches.length} hesap bulundu.` : undefined}>
          {matches.length ? (
            <ul className="space-y-1 text-sm">
              {matches.map((match) => (
                <li key={match.id}>
                  <Link href={href({ gun: days, tur: category, kim: match.id })} className="underline">
                    {match.name}
                  </Link>
                  {match.email && match.email !== match.name ? <span className="text-[var(--adm-muted)]"> · {match.email}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <AdminEmpty title="Eşleşen hesap yok">Adın ya da e-postanın bir parçasını yaz.</AdminEmpty>
          )}
        </AdminCard>
      ) : null}

      {result?.failedSources.length ? (
        <AdminNote tone="warn">Okunamayan kaynak: {result.failedSources.join(", ")}. Öbür işlemler aşağıda.</AdminNote>
      ) : null}

      {!userId && result && summary.topUsers.length ? (
        <AdminCard title="En hareketli kullanıcılar" desc="Bu aralıkta en çok işlem yapanlar. Ada tıklayınca yalnız onun akışı açılır." bodyless>
          <AdminTableFrame columns={["Kim", "İşlem", "Son hareket", ""]}>
            {summary.topUsers.map((row) => {
              const info = result.names.get(row.userId);
              return (
                <tr key={row.userId}>
                  <td>
                    <Link href={href({ gun: days, tur: category, kim: row.userId })} className="font-medium underline">
                      {info?.name ?? row.userId.slice(0, 8)}
                    </Link>
                    {info?.email ? <div className="text-xs text-[var(--adm-muted)]">{info.email}</div> : null}
                  </td>
                  <td className="adm-num">{formatNumber(row.events)}</td>
                  <td className="adm-num text-xs text-[var(--adm-muted)]">
                    {istanbulDayLabel(row.lastAt)} · {istanbulTime(row.lastAt)}
                  </td>
                  <td>
                    <Link href={`/admin/kullanicilar/${row.userId}`} className="text-xs underline">
                      Hesabı aç
                    </Link>
                  </td>
                </tr>
              );
            })}
          </AdminTableFrame>
        </AdminCard>
      ) : null}

      {result ? (
        byDay.length ? (
          byDay.map((group) => (
            <AdminCard key={group.day} title={group.day} desc={`${formatNumber(group.events.length)} işlem`} bodyless>
              <AdminTableFrame columns={userId ? ["Saat", "Ne yaptı", "Ayrıntı"] : ["Saat", "Kim", "Ne yaptı", "Ayrıntı"]}>
                {group.events.map((event) => {
                  const info = result.names.get(event.userId);
                  return (
                    <tr key={event.key}>
                      <td className="adm-num text-xs text-[var(--adm-muted)]">{istanbulTime(event.at)}</td>
                      {userId ? null : (
                        <td>
                          <Link href={href({ gun: days, tur: category, kim: event.userId })} className="underline">
                            {info?.name ?? event.userId.slice(0, 8)}
                          </Link>
                        </td>
                      )}
                      <td>
                        <AdminBadge tone={CATEGORY_TONE[event.category]}>
                          {ACTIVITY_CATEGORIES.find((c) => c.id === event.category)?.label}
                        </AdminBadge>{" "}
                        <span className="font-medium">{event.label}</span>
                      </td>
                      <td className="text-xs text-[var(--adm-muted)]">{event.detail ?? "—"}</td>
                    </tr>
                  );
                })}
              </AdminTableFrame>
            </AdminCard>
          ))
        ) : (
          <AdminCard title="Akış">
            <AdminEmpty title="Bu aralıkta işlem yok">Zaman aralığını genişlet ya da süzgeci kaldır.</AdminEmpty>
          </AdminCard>
        )
      ) : null}
    </AdminShell>
  );
}
