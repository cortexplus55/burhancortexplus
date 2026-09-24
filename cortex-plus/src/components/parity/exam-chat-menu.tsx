"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, LineChart, Search, X } from "lucide-react";
import {
  conversationBucket,
  conversationMeta,
  type ConversationBucket,
  type RecentConversation,
} from "@/lib/student/conversation-time";

const BUCKETS: ConversationBucket[] = ["BUGÜN", "BU AY", "DAHA ESKİ"];

/**
 * Sınav sohbetinin üst "Daha fazla" penceresi.
 *
 * İki kutu ve gerçek konuşma kayıtları. Liste boşsa boş durum yazılır;
 * örnek satır üretilmez.
 */
export function ExamChatMenu({
  conversations,
  conversationHref,
  onClose,
}: {
  conversations: RecentConversation[];
  conversationHref: (id: string) => string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState(false);
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    const rows = conversations.filter((item) =>
      (item.title || "Yeni sohbet").toLocaleLowerCase("tr").includes(q),
    );
    return BUCKETS.map((label) => ({
      label,
      rows: rows.filter((item) => conversationBucket(item.updatedAt) === label),
    })).filter((group) => group.rows.length > 0);
  }, [conversations, query]);

  return (
    <div
      className="cp-sor-menu-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={history ? "Geçmiş konuşmalar" : "Daha fazla"}
      onClick={onClose}
    >
      <div
        className={history ? "cp-exam-menu cp-exam-menu--history" : "cp-exam-menu"}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="cp-exam-menu-x" aria-label="Kapat" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>

        {history ? (
          <>
            <h2 className="cp-exam-menu-title">Geçmiş konuşmalar</h2>
            <label className="cp-exam-history-search">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Konuşmalarda ara"
                aria-label="Konuşmalarda ara"
              />
              <Search className="h-4 w-4" aria-hidden />
            </label>
            {conversations.length === 0 ? (
              <p className="cp-exam-history-empty">Henüz konuşma yok.</p>
            ) : grouped.length === 0 ? (
              <p className="cp-exam-history-empty">Aramanla eşleşen konuşma yok.</p>
            ) : (
              <div className="cp-exam-history-scroll">
                {grouped.map((group) => (
                  <section key={group.label}>
                    <h3 className="cp-exam-bucket">{group.label}</h3>
                    <div className="cp-exam-history-list">
                      {group.rows.map((item) => (
                        <Link
                          key={item.id}
                          href={conversationHref(item.id)}
                          className="cp-exam-history-card"
                          onClick={onClose}
                        >
                          <strong>{item.title || "Yeni sohbet"}</strong>
                          <span>{conversationMeta(item.updatedAt, item.subject)}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="cp-exam-tiles">
              <Link href="/ilerleme" className="cp-exam-tile" onClick={onClose}>
                <LineChart className="h-6 w-6" aria-hidden />
                Aktivitelerim
              </Link>
              <Link href="/calisma-plani?tab=takvim" className="cp-exam-tile" onClick={onClose}>
                <CalendarDays className="h-6 w-6" aria-hidden />
                Takvimim
              </Link>
            </div>
            <button type="button" className="cp-exam-history-jump" onClick={() => setHistory(true)}>
              Geçmiş konuşmalar
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <div className="cp-exam-history-list">
              {conversations.length ? (
                conversations.slice(0, 2).map((item) => (
                  <Link
                    key={item.id}
                    href={conversationHref(item.id)}
                    className="cp-exam-history-card"
                    onClick={onClose}
                  >
                    <strong>{item.title || "Yeni sohbet"}</strong>
                    <span>{conversationMeta(item.updatedAt, item.subject)}</span>
                  </Link>
                ))
              ) : (
                <p className="cp-exam-history-empty">Henüz konuşma yok.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
