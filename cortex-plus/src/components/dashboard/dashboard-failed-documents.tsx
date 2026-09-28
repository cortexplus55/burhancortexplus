"use client";

import Link from "next/link";
import { DocumentDeleteButton } from "@/components/documents/document-delete-button";
import { DocumentRetryButton } from "@/components/documents/document-retry-button";

export function DashboardFailedDocuments({
  documents,
}: {
  documents: { id: string; fileName: string }[];
}) {
  if (!documents.length) return null;

  return (
    <section aria-labelledby="failed-docs-heading" className="space-y-2">
      <h2 id="failed-docs-heading" className="text-sm font-semibold text-[var(--cs-muted)]">
        İşlenemeyen belgeler
      </h2>
      <ul className="space-y-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2"
          >
            <Link
              href={`/dokumanlar/${doc.id}`}
              className="min-w-0 truncate text-sm text-[var(--cs-text)] underline-offset-2 hover:underline"
            >
              {doc.fileName}
            </Link>
            <span className="flex flex-wrap items-center gap-3">
              <DocumentRetryButton documentId={doc.id} />
              <DocumentDeleteButton documentId={doc.id} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
