"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function ClassroomDiscussion({
  classroomId,
}: {
  classroomId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await fetch("/api/student/classroom-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroomId, body: text }),
      });
      if (!res.ok) {
        toast.error("Mesaj gönderilemedi.");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="ap-class-composer" onSubmit={(e) => void submit(e)}>
      <label className="sr-only" htmlFor="class-post">
        Tartışmaya yaz
      </label>
      <textarea
        id="class-post"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Gruba bir not bırak…"
      />
      <button
        type="submit"
        className="ap-exam-continue ap-exam-continue--primary"
        disabled={sending || !body.trim()}
      >
        {sending ? "Gönderiliyor…" : "Gönder"}
      </button>
    </form>
  );
}
