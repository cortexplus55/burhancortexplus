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
  const [creating, setCreating] = useState(false);
  const topic = topics.find((item) => item.id === topicId) ?? topics[0] ?? null;

  async function choose(tool: StudyToolId, label: string) {
    const pick = freeActivityPick(nodes, prepId, topic, tool, topics);
    if (!pick.ok) {
      setMissing(`Önce bir konu seç.`);
      return;
    }
    setMissing(null);
    if (pick.kind !== "create") {
      onOpen({ nodeId: pick.kind === "node" ? pick.nodeId : null, href: pick.href });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/learning/exam-prep/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prepId, tool, topicId: pick.topicId, topicLabel: pick.topicLabel }),
      });
      const data = (await res.json().catch(() => null)) as { nodeId?: string; href?: string } | null;
      if (!res.ok || !data?.nodeId || !data.href) {
        setMissing(`${label} şu an açılamadı. Bir kez daha dene.`);
        return;
      }
      onOpen({ nodeId: data.nodeId, href: data.href });
    } catch {
      setMissing(`${label} şu an açılamadı. Bir kez daha dene.`);
    } finally {
      setCreating(false);
    }
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
              <button type="button" className="cp-study-hub-tile" disabled={busy || creating || !topic} onClick={() => void choose(tool.id, tool.label)}>
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
