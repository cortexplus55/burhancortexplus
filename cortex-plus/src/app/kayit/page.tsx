import { SignupWizard } from "./signup-wizard";
import { Suspense } from "react";

export const metadata = {
  title: "Hesap oluştur",
  description: "Öğrenci hesabı oluştur; ücretsiz haklarla Cortex Plus'a başla.",
};

export default function KayitPage() {
  return (
    <Suspense fallback={null}>
      <SignupWizard />
    </Suspense>
  );
}
