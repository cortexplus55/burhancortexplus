"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  FREE_PICK_TOOLS,
  freeActivityPick,
  type StudyNodeRef,
  type StudyToolId,
} from "@/lib/learning/study-tools";

export function FreeActivityPicker({
  prepId,
  nodes,
  topics,
  busy,
  onClose,
  onOpen,
}: {
  prepId: string;
  nodes: StudyNodeRef[];
  topics: { id: string; label: string }[];
  busy?: boolean;
  onClose: () => void;
  onOpen: (pick: { nodeId: string | null; href: string }) => void;
}) {
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [missing, setMissing] = useState<string | null>(null);
  const topic = topics.find((item) => item.id === topicId) ?? topics[0] ?? null;

  function choose(tool: StudyToolId, label: string) {
    const pick = freeActivityPick(nodes, prepId, topic, tool, topics);
    if (!pick.ok) {
      setMissing(`${topic?.label ?? "Bu konu"} için ${label.toLocaleLowerCase("tr-TR")} yok.`);
      return;
    }
    setMissing(null);
    onOpen({ nodeId: pick.kind === "node" ? pick.nodeId : null, href: pick.href });
  }

  return (
    <div className="cp-oral-modal-back" onClick={onClose}>
      <div
        className="cp-oral-modal cp-study-hub"
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-pick-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="cp-oral-bar">
          <span />
          <h2 id="free-pick-title">Başka Bir Konu veya Etkinlik Seç</h2>
          <button type="button" className="cp-oral-icon" aria-label="Kapat" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <p className="cp-study-hub-hint">Seçtiğin konunun etkinliği hemen açılır. Sıradaki adım öneri olarak kalır.</p>
        {topics.length ? (
          <label className="cp-field">
            <span>Konu</span>
            <select aria-label="Konu seç" value={topic?.id ?? ""} onChange={(event) => setTopicId(event.target.value)}>
              {topics.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="cp-oral-empty">Bu hazırlıkta konu yok.</p>
        )}
        <ul className="cp-study-hub-grid">
          {FREE_PICK_TOOLS.map((tool) => (
            <li key={tool.id}>
              <button type="button" className="cp-study-hub-tile" disabled={busy || !topic} onClick={() => choose(tool.id, tool.label)}>
                <strong>{tool.label}</strong>
                <em>Şimdi başlat</em>
              </button>
            </li>
          ))}
        </ul>
        {missing ? <p role="status">{missing}</p> : null}
      </div>
    </div>
  );
}
