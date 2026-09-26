"use client";

import Link from "next/link";
import { BookOpen, Headphones, Mic, FileQuestion, ListChecks, Layers, Sparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "@/styles/oral-exam-chrome.css";
import {
  STUDY_PATH_HINT,
  STUDY_TOOLS,
  openStudyActivity,
  studyActivityHref,
  studyPodcastHref,
  type StudyNodeRef,
  type StudyToolId,
} from "@/lib/learning/study-tools";

const TOOL_ICONS: Record<StudyToolId, LucideIcon> = {
  lesson: BookOpen,
  podcast: Headphones,
  oral: Mic,
  written_exam: FileQuestion,
  quiz: ListChecks,
  flashcards: Layers,
  qa: Sparkles,
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
}: {
  prepId: string;
  nodes: StudyNodeRef[];
  topics: string[];
  /** exam_prep_topics kimliği. Yoksa podcast seçicisi kendi listesini açar. */
  topicOptions?: { id: string; label: string }[];
  topicLabel: string | null;
  onTopic: (label: string | null) => void;
  onClose: () => void;
}) {
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
        <ul className="cp-study-hub-grid">
          {STUDY_TOOLS.map((tool) => {
            const Icon = TOOL_ICONS[tool.id];
            const href =
              tool.id === "podcast"
                ? studyPodcastHref(prepId, topicLabel, topicOptions)
                : (() => {
                    const target = openStudyActivity(nodes, tool.id, { label: topicLabel });
                    return target
                      ? studyActivityHref(prepId, target.node.id, target.topicQuery)
                      : null;
                  })();
            const body = (
              <>
                <span className={`cp-study-hub-icon cp-study-hub-icon--${tool.id}`} aria-hidden>
                  <Icon className="h-5 w-5" />
                </span>
                <strong>{tool.title}</strong>
                <em>{href ? tool.blurb : "Bu konuda yok"}</em>
              </>
            );
            return (
              <li key={tool.id}>
                {href ? (
                  <Link href={href} className="cp-study-hub-tile" aria-label={tool.title}>
                    {body}
                  </Link>
                ) : (
                  <span className="cp-study-hub-tile is-off" aria-disabled="true">
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
