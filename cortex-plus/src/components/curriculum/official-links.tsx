import { ExternalLink } from "lucide-react";
import { officialLinksFor } from "@/lib/curriculum/official-links";

/** "İlgili resmî kaynaklar": yalnız bağlantı; belge içeriği uygulamada gösterilmez. */
export function OfficialLinks({ exam, className }: { exam: string | null | undefined; className?: string }) {
  const links = officialLinksFor(exam);
  if (!links.length) return null;
  return (
    <aside className={className ?? "osf-links"} aria-label="İlgili resmî kaynaklar" data-testid="official-links">
      <p className="osf-links-title">İlgili resmî kaynaklar</p>
      <ul>
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer noopener">
              {l.title} <ExternalLink className="inline h-3 w-3" aria-hidden />
            </a>{" "}
            <span>· {l.publisher}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
