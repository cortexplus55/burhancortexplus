"use client";

import { Suspense } from "react";
import GirisPage from "./giris-inner";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8">Yükleniyor…</div>}>
      <GirisPage />
    </Suspense>
  );
}
