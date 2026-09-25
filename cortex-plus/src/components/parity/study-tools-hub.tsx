"use client";

import Link from "next/link";
import { X } from "lucide-react";
import "@/styles/oral-exam-chrome.css";
import {
  STUDY_PATH_HINT,
  STUDY_TOOLS,
  resolveStudyToolNode,
  studyToolHref,
  type StudyNodeRef,
} from "@/lib/learning/study-tools";

/**
 * Hazırlık düzeyinde "Ders oluştur".
 * Podcast karosu da aynı listedeki bir düğümdür; podcast üretimine
 * burada dokunulmaz. Başka bir akış o düğümü açar.
 */
export function StudyToolsHub({
  prepId,
  nodes,
  topics,
  topicLabel,
  onTopic,
  onClose,
}: {
  prepId: string;
  nodes: StudyNodeRef[];
  topics: string[];
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
            <span>Konu</span>
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
            const node = resolveStudyToolNode(nodes, tool.id, { label: topicLabel });
            const href = node ? studyToolHref(prepId, node.id) : null;
            return (
              <li key={tool.id}>
                {href ? (
                  <Link href={href} className="cp-study-hub-tile" aria-label={tool.title}>
                    <strong>{tool.title}</strong>
                    <em>{tool.blurb}</em>
                  </Link>
                ) : (
                  <span className="cp-study-hub-tile is-off" aria-disabled="true">
                    <strong>{tool.title}</strong>
                    <em>Bu konuda bu etkinlik yok</em>
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
