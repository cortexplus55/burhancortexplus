"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { X } from "lucide-react";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import "@/styles/oral-exam-chrome.css";
import { chooseStudyNode } from "@/lib/learning/choose-study-node";
import { toolBeyondFreeDaily } from "@/lib/billing/free-reach";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import {
  STUDY_HUB_HINT,
  STUDY_TOOLS,
  STUDY_TOOL_GROUPS,
  activityCreatable,
  freeActivityPick,
  mockExamSetupHref,
  openStudyActivity,
  recommendedStudyTool,
  studyNodeOpenable,
  studyToolLock,
  type StudyToolGroup,
  studyActivityHref,
  studyPodcastHref,
  studyVideoHref,
  type StudyNodeRef,
  type StudyToolId,
  type StudyTopicRef,
} from "@/lib/learning/study-tools";

/** 3B simge seti (tasarım 7. adım); her araç kendi görseliyle. */
const TOOL_ICONS: Record<StudyToolId, Icon3DName> = {
  lesson: "ders",
  podcast: "podcast",
  video: "video",
  oral: "sozlu",
  written_exam: "yazili",
  quiz: "konu-testi",
  flashcards: "kartlar",
  qa: "ogretmen",
  gaps: "bosluk",
  focused: "alistirma",
  true_false: "dogru-yanlis",
  spaced: "tekrar",
};

/**
 * Hazırlık düzeyinde "Ders oluştur".
 * Podcast karosu hazırlığın podcast rotasına gider; konu ve süre
 * seçici oradadır. Burada ikinci bir üretim akışı yok.
 */
export function StudyToolsHub({
  prepId,
  nodes,
  topics,
  topicOptions = [],
  topicLabel,
  onTopic,
  onClose,
  openMisconceptions = 0,
  preferred = [],
  initialGroup,
}: {
  prepId: string;
  nodes: StudyNodeRef[];
  /** Kurulumda seçilen çalışma biçimleri: "Önerilen" rozetini yönlendirir. */
  preferred?: readonly string[];
  /** Açık yanılgı sayısı: Bilgi boşlukları kilidini açar. */
  openMisconceptions?: number;
  topics: string[];
  /** exam_prep_topics kimliği (belgeli hazırlıkta belge konu düğümü de). Yoksa podcast seçicisi kendi listesini açar. */
  topicOptions?: { id: string; label: string; documentTopicNodeId?: string | null }[];
  topicLabel: string | null;
  onTopic: (label: string | null) => void;
  onClose: () => void;
  /** Açılacak sekme; yoksa önerilen etkinliğin sekmesi. */
  initialGroup?: StudyToolGroup;
}) {
  const shellAccount = useStudentShellAccount();
  const freeAccount = shellAccount ? !shellAccount.isPremium : false;
  // Astra gibi üç sekme; pencere önerilen etkinliğin sekmesinde açılır.
  const recommended = recommendedStudyTool(nodes, preferred);
  const [group, setGroup] = useState<StudyToolGroup>(initialGroup ?? recommended?.group ?? "learn");
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Seçilen konu iki kimliğiyle (konu satırı + belge konu düğümü): düğüm araması kimlikle (`topic-identity.ts`).
  const chosenOption = topicLabel ? topicOptions.find((option) => option.label === topicLabel) : undefined;
  const chosenTopic: StudyTopicRef | null = topicLabel
    ? { id: chosenOption?.id ?? null, documentTopicNodeId: chosenOption?.documentTopicNodeId ?? null, label: topicLabel }
    : null;
  // Yol sırayla açılır; buradan seçilen kilitli etkinliğin kilidi gitmeden kalkar.
  async function openChosen(nodeId: string, href: string) {
    if (choosing) return;
    setChoosing(true);
    await chooseStudyNode(prepId, nodeId);
    router.push(href);
  }
  /**
   * Yolda bu etkinliğin düğümü yoksa (kısa planda sözlü, konuya özgü kart …) "Başka Bir Konu veya
   * Etkinlik Seç" ile aynı uçla oluşturulur (30 Ekim 2026, Paket I #12): iki giriş aynı işlevden geçer,
   * "Bu konuda yok" denmez.
   */
  async function createAndOpen(tool: StudyToolId, title: string) {
    if (choosing) return;
    const pick = freeActivityPick(nodes, prepId, chosenTopic, tool, topicOptions);
    if (!pick.ok) {
      setCreateError("Önce bir konu seç.");
      return;
    }
    if (pick.kind !== "create") {
      router.push(pick.href);
      return;
    }
    setChoosing(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/learning/exam-prep/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prepId, tool, topicId: pick.topicId, topicLabel: pick.topicLabel }),
      });
      const data = (await res.json().catch(() => null)) as { href?: string } | null;
      if (!res.ok || !data?.href) {
        setCreateError(`${title} şu an açılamadı. Bir kez daha dene.`);
        return;
      }
      router.push(data.href);
    } catch {
      setCreateError(`${title} şu an açılamadı. Bir kez daha dene.`);
    } finally {
      setChoosing(false);
    }
  }
  return (
    <div className="cp-oral-modal-back" onClick={onClose}>
      <div
        className="cp-oral-modal cp-study-hub"
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-hub-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="cp-oral-bar">
          <span />
          <h2 id="study-hub-title">Ders oluştur</h2>
          <button type="button" className="cp-oral-icon" aria-label="Kapat" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <p className="cp-study-hub-hint">{STUDY_HUB_HINT}</p>
        {topics.length ? (
          <label className="cp-field">
            <span>Konu seç</span>
            <select
              aria-label="Konu seç"
              value={topicLabel ?? ""}
              onChange={(event) => onTopic(event.target.value || null)}
            >
              <option value="">Konu seçmeden</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="cp-oral-empty">Bu hazırlıkta konu yok. Etkinlik yine de plandaki düğümden açılır.</p>
        )}
        <div className="cp-study-hub-tabs" role="tablist" aria-label="Etkinlik türü">
          {STUDY_TOOL_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={group === item.id}
              className={group === item.id ? "is-on" : undefined}
              onClick={() => setGroup(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <ul className="cp-study-hub-grid">
          {STUDY_TOOLS.filter((tool) => tool.group === group).map((tool) => {
            const lock = studyToolLock(tool.id, { nodes, openMisconceptions });
            // Konu seçiliyse ve etkinlik konuya kurulabiliyorsa yalnız o konunun KENDİ düğümü açılır; yoksa kurulur
            // ("Başka Bir Konu veya Etkinlik Seç" ile aynı işlev). 30 Ekim 2026 canlı tur: "Enflasyon Türleri" için
            // seçilen sözlü, başka konunun sözlü adımında `?konu=` ile açılıp o adıma (Para Politikası) yazılmıştı.
            const ownPick =
              !lock && chosenTopic && activityCreatable(tool.id)
                ? freeActivityPick(nodes, prepId, chosenTopic, tool.id, topicOptions)
                : null;
            const ownNode =
              ownPick?.ok && ownPick.kind === "node" ? (nodes.find((node) => node.id === ownPick.nodeId) ?? null) : null;
            const target =
              lock || tool.id === "podcast" || tool.id === "video"
                ? null
                : ownPick
                  ? ownNode
                    ? { node: ownNode, topicQuery: null }
                    : null
                  : openStudyActivity(nodes, tool.id, chosenTopic ?? undefined);
            const href = lock
              ? null
              : tool.id === "podcast"
                ? studyPodcastHref(prepId, topicLabel, topicOptions)
                : tool.id === "video"
                  ? studyVideoHref(prepId, topicLabel, topicOptions)
                  : target
                    ? studyActivityHref(prepId, target.node.id, target.topicQuery)
                    : tool.id === "written_exam"
                      ? mockExamSetupHref(prepId)
                      : null;
            /** Düğümü yok ama kilitli de değil: aynı oluşturma uçuyla açılır (uç yalnız bu araçları kurar). */
            const creatable = !lock && !href && activityCreatable(tool.id);
            /** Kilitli düğüm: önce seç (kilit kalkar), sonra git. */
            const chooseFirst = target && !studyNodeOpenable(target.node.status, target.node.kind) ? target.node.id : null;
            const body = (
              <>
                <span className={`cp-study-hub-icon cp-study-hub-icon--${tool.id} cp-study-hub-icon--3d`} aria-hidden>
                  <Icon3D name={TOOL_ICONS[tool.id]} size={40} />
                </span>
                {recommended?.id === tool.id ? (
                  <span className="cp-study-hub-badge">Önerilen</span>
                ) : freeAccount && toolBeyondFreeDaily(tool.id) ? (
                  /* 19 Ekim 2026: ücretsiz günlük haktan büyük iş; kapıya kurulumdan sonra çarpmasın. */
                  <span className="cp-study-hub-badge cp-study-hub-badge--plus">Plus</span>
                ) : null}
                <strong>{lock ? `🔒 ${tool.title}` : tool.title}</strong>
                <em>{lock ?? (href || creatable ? tool.blurb : "Bu hazırlığın yolunda yok")}</em>
              </>
            );
            return (
              <li key={tool.id}>
                {href ? (
                  <Link
                    href={href}
                    className="cp-study-hub-tile"
                    aria-label={tool.title}
                    aria-busy={choosing && chooseFirst ? true : undefined}
                    onClick={
                      chooseFirst
                        ? (event) => {
                            event.preventDefault();
                            void openChosen(chooseFirst, href);
                          }
                        : undefined
                    }
                  >
                    {body}
                  </Link>
                ) : creatable ? (
                  <button
                    type="button"
                    className="cp-study-hub-tile"
                    aria-label={tool.title}
                    aria-busy={choosing || undefined}
                    disabled={choosing}
                    onClick={() => void createAndOpen(tool.id, tool.title)}
                  >
                    {body}
                  </button>
                ) : (
                  <span className={cn("cp-study-hub-tile is-off", lock && "is-locked")} aria-disabled="true">
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {createError ? (
          <p role="alert" className="cp-oral-empty">
            {createError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
