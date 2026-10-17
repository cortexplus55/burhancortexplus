"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { X } from "lucide-react";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import "@/styles/oral-exam-chrome.css";
import {
  STUDY_PATH_HINT,
  STUDY_TOOLS,
  STUDY_TOOL_GROUPS,
  openStudyActivity,
  recommendedStudyTool,
  studyToolLock,
  type StudyToolGroup,
  studyActivityHref,
  studyPodcastHref,
  studyVideoHref,
  type StudyNodeRef,
  type StudyToolId,
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
  /** exam_prep_topics kimliği. Yoksa podcast seçicisi kendi listesini açar. */
  topicOptions?: { id: string; label: string }[];
  topicLabel: string | null;
  onTopic: (label: string | null) => void;
  onClose: () => void;
  /** Açılacak sekme; yoksa önerilen etkinliğin sekmesi. */
  initialGroup?: StudyToolGroup;
}) {
  // Astra gibi üç sekme; pencere önerilen etkinliğin sekmesinde açılır.
  const recommended = recommendedStudyTool(nodes, preferred);
  const [group, setGroup] = useState<StudyToolGroup>(initialGroup ?? recommended?.group ?? "learn");
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
        <p className="cp-study-hub-hint">{STUDY_PATH_HINT}</p>
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
            const href = lock
              ? null
              : tool.id === "podcast"
                ? studyPodcastHref(prepId, topicLabel, topicOptions)
                : tool.id === "video"
                  ? studyVideoHref(prepId, topicLabel, topicOptions)
                : (() => {
                    const target = openStudyActivity(nodes, tool.id, { label: topicLabel });
                    return target
                      ? studyActivityHref(prepId, target.node.id, target.topicQuery)
                      : null;
                  })();
            const body = (
              <>
                <span className={`cp-study-hub-icon cp-study-hub-icon--${tool.id} cp-study-hub-icon--3d`} aria-hidden>
                  <Icon3D name={TOOL_ICONS[tool.id]} size={40} />
                </span>
                {recommended?.id === tool.id ? <span className="cp-study-hub-badge">Önerilen</span> : null}
                <strong>{lock ? `🔒 ${tool.title}` : tool.title}</strong>
                <em>{lock ?? (href ? tool.blurb : "Bu konuda yok")}</em>
              </>
            );
            return (
              <li key={tool.id}>
                {href ? (
                  <Link href={href} className="cp-study-hub-tile" aria-label={tool.title}>
                    {body}
                  </Link>
                ) : (
                  <span className={cn("cp-study-hub-tile is-off", lock && "is-locked")} aria-disabled="true">
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
