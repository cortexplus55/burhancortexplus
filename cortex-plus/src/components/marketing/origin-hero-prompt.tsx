"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";

export function OriginHeroAiPrompt() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/kayit?prompt=${encodeURIComponent(q)}`);
    } else {
      router.push("/kayit");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mk-ai-input-wrap mt-10">
      <input
        className="mk-ai-input"
        placeholder="Bu hafta hangi konuda zayıfım?"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="AI öğretmene sor"
      />
      <button type="submit" className="mk-ai-submit" aria-label="Gönder">
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}
