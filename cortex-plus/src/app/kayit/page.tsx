import { SignupWizard } from "./signup-wizard";
import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata = pageMetadata({
  title: "Hesap oluştur",
  description:
    "Öğrenci hesabı oluştur; ücretsiz haklarla Cortex Plus'a başla.",
  path: "/kayit",
});

export default function KayitPage() {
  return (
    <Suspense fallback={null}>
      <SignupWizard />
    </Suspense>
  );
}
