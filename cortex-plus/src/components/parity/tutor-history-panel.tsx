"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, CalendarDays, ChevronDown, History, PanelLeftClose, X } from "lucide-react";
import { shortDayLabel } from "@/lib/learning/day-label";
import { TUTOR_HISTORY_EVENT, type TutorHistoryDetail } from "@/lib/ui/home-events";
import { GENERAL_GROUP_KEY, type ConversationGroup } from "@/lib/tutor/conversation-groups";
import "@/styles/conversation-history.css";

/*
  Öğretmen ana ekranının geçmiş paneli (Faz 11, teacher.v2, 21 Kasım 2026). Konuşmalar hazırlığa göre gruplu; veri
  `GET /api/teacher/conversations`'tan, yalnız panel görünür olunca istenir (sayfanın sunucu sorgu bütçesine girmez).

  - Geniş ekranda (≥1200 px) ve sohbet açıkken: sohbet sütununun solunda daraltılabilir yan panel. Sütun 48rem'in
    altına inmez: panel açıkken içerik sağa kayar (yazma alanı dahil), üst çubuğa ve yazma alanına binmez. Daraltma
    tercihi tarayıcıda saklanır; saklanamazsa panel açık başlar.
  - Öbür durumlarda (telefon, tablet, sohbet açılmadan önceki ana ekran) küçük bir "Geçmiş" düğmesi çekmeceyi açar:
    odak içinde kalır, Esc kapatır, odak düğmeye döner; çekmece alttaki gezinme çubuğunun da üstündedir.
  - Konuşmaya dokununca bugün o konuşmayı açan adres (`/ogretmen?sohbet=…`, Geçmiş konuşmalar sayfasıyla aynı).
  Yerleşim kuralları `conversation-history.css`'te; sohbet ekranının kendisine dokunulmaz.
*/

export const HISTORY_ENDPOINT = "/api/teacher/conversations";
/** Daraltılmış yan panelin tarayıcıdaki kaydı (yalnız kolaylık; okunamazsa panel açık başlar). */
export const HISTORY_COLLAPSED_KEY = "cp:sohbet-gecmisi:daraltildi";
/** Yan panelin göründüğü genişlik (CSS ile aynı). */
export const HISTORY_DOCK_MEDIA = "(min-width: 1200px)";
const NO_TITLE = "Başlıksız sohbet";

type Status = "idle" | "loading" | "ready" | "error";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(HISTORY_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    if (value) window.localStorage.setItem(HISTORY_COLLAPSED_KEY, "1");
    else window.localStorage.removeItem(HISTORY_COLLAPSED_KEY);
  } catch {
    // Gizli sekme ya da kapalı depolama: tercih yalnız bu açılışta geçerli.
  }
}

/**
 * Sohbet açık mı (yan panel yalnız o zaman yerleşir). Sohbet ekranının mesaj listesi varsa açıktır; öğretmen v3'te
 * (teacher.v2 ana sohbeti) liste `.cx-v3-thread`.
 */
function conversationOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector(".cp-sor-messages, .cx-v3-thread") !== null;
}

/** Düğme görünür mü (öğretmen v3 sohbetinde panelin kendi düğmesi gizli; geçmişi şeritteki saat düğmesi açar). */
function visible(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element && element.isConnected && element.getClientRects().length > 0);
}

function isGroupList(value: unknown): value is ConversationGroup[] {
  return (
    Array.isArray(value) &&
    value.every(
      (group) =>
        group &&
        typeof group === "object" &&
        typeof (group as ConversationGroup).key === "string" &&
        typeof (group as ConversationGroup).title === "string" &&
        Array.isArray((group as ConversationGroup).conversations),
    )
  );
}

export function TutorHistoryPanel({ activeConversationId }: { activeConversationId?: string | null }) {
  const [groups, setGroups] = useState<ConversationGroup[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  /** Paneli dışarıdan açan düğme (öğretmen v3 şeridindeki saat): odak oraya döner. */
  const openerRef = useRef<HTMLElement | null>(null);
  const collapsedRef = useRef(false);
  const dockRef = useRef<HTMLElement | null>(null);
  const collapseRef = useRef<HTMLButtonElement | null>(null);
  const focusCollapse = useRef(false);
  const inflight = useRef(false);
  const titleId = useId();
  const dockTitleId = useId();

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setStatus("loading");
    try {
      const response = await fetch(HISTORY_ENDPOINT, { cache: "no-store" });
      const body = response.ok ? ((await response.json()) as { groups?: unknown }) : null;
      if (!body || !isGroupList(body.groups)) {
        setStatus("error");
        return;
      }
      setGroups(body.groups);
      setStatus("ready");
    } catch {
      setStatus("error");
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  // Yan panel yalnız görünür olunca (CSS: geniş ekran + açık sohbet) veriyi ister; gizliyken istek yok.
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (dock.offsetWidth > 0 && status === "idle") void load();
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, [load, status]);

  useEffect(() => {
    if (!collapsed && focusCollapse.current) {
      focusCollapse.current = false;
      collapseRef.current?.focus();
    }
  }, [collapsed]);

  collapsedRef.current = collapsed;

  function openHistory(opener: HTMLElement | null = null) {
    openerRef.current = opener;
    const dockable = window.matchMedia(HISTORY_DOCK_MEDIA).matches && conversationOpen();
    if (dockable) {
      focusCollapse.current = true;
      setCollapsed(false);
      writeCollapsed(false);
      if (status !== "loading") void load();
      return;
    }
    setDrawerOpen(true);
    if (status !== "loading") void load();
  }

  /** Paneli yeniden açacak görünür düğme: panelin kendi düğmesi ya da (öğretmen v3) şeritteki saat. */
  function reopenTarget(): HTMLElement | null {
    if (visible(toggleRef.current)) return toggleRef.current;
    if (visible(openerRef.current)) return openerRef.current;
    // Öğretmen v3: kendi düğmemiz açık sohbette gizli; panel ilk açılışta açık geldiyse açan düğme de yok. Odak şeridin
    // geçmiş düğmesine gider.
    const barButton = document.querySelector<HTMLElement>("[data-tutor-history-opener]");
    return visible(barButton) ? barButton : toggleRef.current;
  }

  function collapseDock() {
    setCollapsed(true);
    writeCollapsed(true);
    // Daralt düğmesi kayboluyor: odak, paneli yeniden açan düğmeye geçer.
    requestAnimationFrame(() => reopenTarget()?.focus());
  }

  // Öğretmen v3 şeridindeki saat düğmesi: geniş ekranda açık sohbette yan paneli açıp kapatır, öbür durumlarda çekmeceyi açar.
  const fromBar = useRef<(event: Event) => void>(() => undefined);
  fromBar.current = (event: Event) => {
    event.preventDefault();
    const opener = (event as CustomEvent<TutorHistoryDetail>).detail?.opener ?? null;
    const dockable = window.matchMedia(HISTORY_DOCK_MEDIA).matches && conversationOpen();
    if (dockable && !collapsedRef.current) {
      openerRef.current = opener;
      collapseDock();
      return;
    }
    openHistory(opener);
  };
  useEffect(() => {
    const listener = (event: Event) => fromBar.current(event);
    window.addEventListener(TUTOR_HISTORY_EVENT, listener);
    return () => window.removeEventListener(TUTOR_HISTORY_EVENT, listener);
  }, []);

  function toggleGroup(key: string) {
    setClosedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const list = (prefix: string, onNavigate?: () => void) => (
    <HistoryGroups
      idPrefix={prefix}
      groups={groups}
      status={status}
      activeConversationId={activeConversationId ?? null}
      closedGroups={closedGroups}
      onToggleGroup={toggleGroup}
      onRetry={() => void load()}
      onNavigate={onNavigate}
    />
  );

  return (
    <div className="cx-thist" data-collapsed={collapsed ? "true" : "false"}>
      <button
        ref={toggleRef}
        type="button"
        className="cx-thist-toggle cx-glass"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        onClick={() => openHistory()}
      >
        <History aria-hidden />
        <span>Geçmiş</span>
      </button>

      <aside ref={dockRef} className="cx-thist-dock" aria-labelledby={dockTitleId}>
        <div className="cx-thist-head">
          <h2 id={dockTitleId} className="cx-thist-title">
            Sohbet geçmişi
          </h2>
          <button
            ref={collapseRef}
            type="button"
            className="cx-thist-icon"
            aria-label="Geçmişi daralt"
            onClick={collapseDock}
          >
            <PanelLeftClose aria-hidden />
          </button>
        </div>
        {list(`${dockTitleId}-yan`)}
      </aside>

      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="cx-thist-backdrop" />
          <Dialog.Popup className="cx-thist-drawer" finalFocus={() => reopenTarget()} data-testid="tutor-history-drawer">
            <div className="cx-thist-head">
              <Dialog.Title id={titleId} className="cx-thist-title">
                Sohbet geçmişi
              </Dialog.Title>
              <Dialog.Close className="cx-thist-icon" aria-label="Kapat">
                <X aria-hidden />
              </Dialog.Close>
            </div>
            {list(`${titleId}-cekmece`, () => setDrawerOpen(false))}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function HistoryGroups({
  idPrefix,
  groups,
  status,
  activeConversationId,
  closedGroups,
  onToggleGroup,
  onRetry,
  onNavigate,
}: {
  idPrefix: string;
  groups: ConversationGroup[] | null;
  status: Status;
  activeConversationId: string | null;
  closedGroups: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  onRetry: () => void;
  onNavigate?: () => void;
}) {
  let body: ReactNode;
  if (!groups && status === "error") {
    body = (
      <div className="cx-thist-note" role="alert">
        <p>Geçmiş konuşmalar şu an okunamadı.</p>
        <button type="button" className="cx-thist-retry cx-glass" onClick={onRetry}>
          Tekrar dene
        </button>
      </div>
    );
  } else if (!groups) {
    body = (
      <div className="cx-thist-loading" aria-busy="true" aria-label="Geçmiş yükleniyor">
        {[0, 1, 2, 3].map((item) => (
          <span key={item} className="cx-thist-skeleton cx-skeleton" />
        ))}
      </div>
    );
  } else if (!groups.length) {
    body = <p className="cx-thist-note">Henüz sohbetin yok.</p>;
  } else {
    body = groups.map((group, index) => {
      const open = !closedGroups.has(group.key);
      const listId = `${idPrefix}-${index}`;
      return (
        <section key={group.key} className="cx-thist-group" data-group={group.key === GENERAL_GROUP_KEY ? "genel" : "hazirlik"}>
          <h3 className="cx-thist-group-head">
            <button
              type="button"
              className="cx-thist-group-toggle"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => onToggleGroup(group.key)}
            >
              <ChevronDown className="cx-hgroup-chevron" aria-hidden />
              <span className="cx-thist-group-title">{group.title}</span>
              {group.examDate ? (
                <span className="cx-hgroup-date">
                  <CalendarDays aria-hidden />
                  <span className="sr-only">Sınav tarihi: </span>
                  {shortDayLabel(group.examDate)}
                </span>
              ) : null}
            </button>
          </h3>
          <ul id={listId} className="cx-thist-list" hidden={!open}>
            {group.conversations.map((conversation) => {
              const active = conversation.id === activeConversationId;
              return (
                <li key={conversation.id}>
                  <Link
                    href={`/ogretmen?sohbet=${conversation.id}`}
                    className="cx-thist-link"
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    {conversation.title || NO_TITLE}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      );
    });
  }

  return (
    <>
      <div className="cx-thist-body">{body}</div>
      <div className="cx-thist-foot">
        <Link href="/sohbetler" className="cx-thist-all" onClick={onNavigate}>
          Geçmiş konuşmalar
          <ArrowRight aria-hidden />
        </Link>
      </div>
    </>
  );
}
