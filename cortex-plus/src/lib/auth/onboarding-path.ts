/** Profil tamamlanmamış kullanıcıyı yönlendirme (middleware ile uyumlu). */
export function onboardingPathForRole(_role: string | null | undefined): string {
  return "/onboarding";
}
