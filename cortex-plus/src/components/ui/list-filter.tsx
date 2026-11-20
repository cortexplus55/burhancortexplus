"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "@/styles/list-filter.css";

/*
  Liste sayfalarının anlık arama kutusu, süzgeç çipleri ve "sonuç yok" ekranı (20 Kasım 2026, Faz 3: Belgelerim ve
  Sınav hazırlıklarım). Durum tutmaz; değer ve değişim çağırandan gelir. Seçim mavi değil, bir basamak açık zemin
  (`bg-3`): ekrandaki tek marka düğmesi listenin kendi eylemidir.
*/

export function ListSearchBox({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Ekran okuyucunun okuduğu ad. */
  label: string;
  placeholder: string;
}) {
  return (
    <div className="cx-list-search">
      <Search className="cx-list-search-icon" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <button type="button" className="cx-list-search-clear" aria-label="Aramayı temizle" onClick={() => onChange("")}>
          <X aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function ListFilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** Grubun adı (ekran okuyucu). */
  label: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="cx-list-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={cn("cx-list-chip", value === option.id && "is-on")}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Süzgece uyan öğe yoksa: başlık ve tek "temizle" düğmesi. */
export function ListFilterEmpty({ title, onClear }: { title: string; onClear: () => void }) {
  return (
    <div className="cx-list-empty" role="status">
      <Search className="cx-list-empty-icon" aria-hidden />
      <p className="cx-list-empty-title">{title}</p>
      <button type="button" className="cx-list-empty-clear" onClick={onClear}>
        Süzgeçleri temizle
      </button>
    </div>
  );
}
