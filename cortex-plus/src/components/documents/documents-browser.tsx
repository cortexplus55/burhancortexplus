"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ListFilterChips, ListFilterEmpty, ListSearchBox } from "@/components/ui/list-filter";
import {
  DOCUMENT_KIND_FILTERS,
  DOCUMENT_STATUS_FILTERS,
  EMPTY_DOCUMENT_FILTER,
  filterDocuments,
  isDocumentFilterActive,
  type DocumentFilter,
  type DocumentFilterItem,
} from "@/lib/documents/document-filter";

export type DocumentBrowserItem = DocumentFilterItem & {
  /** Sunucuda çizilmiş kart (`<li className="cp-docs-card">`). */
  card: ReactNode;
};

/**
 * Belgelerim listesi, anlık arama ve süzgeçle (20 Kasım 2026, Faz 3). Kartlar sunucuda çizilir ve olduğu gibi gelir;
 * burada yalnız hangisinin görüneceği seçilir. Ağ isteği yok.
 */
export function DocumentsBrowser({ items }: { items: DocumentBrowserItem[] }) {
  const [filter, setFilter] = useState<DocumentFilter>(EMPTY_DOCUMENT_FILTER);
  const shown = useMemo(() => filterDocuments(items, filter), [items, filter]);
  const active = isDocumentFilterActive(filter);

  return (
    <>
      <div className="cx-list-filter" data-testid="documents-filter">
        <ListSearchBox
          value={filter.query}
          onChange={(query) => setFilter((current) => ({ ...current, query }))}
          label="Belgelerde ara"
          placeholder="Dosya adına göre ara"
        />
        <ListFilterChips
          label="Duruma göre süz"
          options={DOCUMENT_STATUS_FILTERS}
          value={filter.status}
          onChange={(status) => setFilter((current) => ({ ...current, status }))}
        />
        <ListFilterChips
          label="Türe göre süz"
          options={DOCUMENT_KIND_FILTERS}
          value={filter.kind}
          onChange={(kind) => setFilter((current) => ({ ...current, kind }))}
        />
        <p className="cx-list-count" aria-live="polite">
          {active ? `${shown.length} belge gösteriliyor` : ""}
        </p>
      </div>

      {shown.length ? (
        <ul className="cp-docs-list">
          {shown.map((item) => (
            <Fragment key={item.id}>{item.card}</Fragment>
          ))}
        </ul>
      ) : (
        <ListFilterEmpty title="Aramana uyan belge yok" onClear={() => setFilter(EMPTY_DOCUMENT_FILTER)} />
      )}
    </>
  );
}
