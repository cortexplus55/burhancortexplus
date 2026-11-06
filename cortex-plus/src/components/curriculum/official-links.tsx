import { ExternalAnchor } from "@/components/ui/external-anchor";
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
            <ExternalAnchor href={l.url} icon>
              {l.title}
            </ExternalAnchor>{" "}
            <span>· {l.publisher}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
