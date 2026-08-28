"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="cortex-premium-error flex min-h-dvh flex-col items-center justify-center bg-[#050505] px-4 text-[#fafafa]">
      <div className="cortex-premium-auth__card max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e8a838]">
          Cortex Plus
        </p>
        <h1 className="mt-4 text-xl font-semibold">Bir şeyler ters gitti</h1>
        <p className="mt-3 text-sm text-[#a3a3a3]">
          Sayfa yüklenirken bir sorun oluştu. Tekrar deneyebilir veya ana uygulamaya
          dönebilirsin.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[10px] text-[#737373]">
            Ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-[#e8a838] px-6 py-2.5 text-sm font-semibold text-black hover:brightness-110"
          >
            Tekrar dene
          </button>
          <Link
            href="/ogretmen"
            className="rounded-full border border-white/10 px-6 py-2.5 text-sm font-medium hover:border-[#e8a838]/40"
          >
            Ana uygulama
          </Link>
        </div>
        <p className="mt-6 text-xs text-[#737373]">
          <Link href="/destek" className="underline hover:text-[#a3a3a3]">
            Destek
          </Link>
        </p>
      </div>
    </div>
  );
}
