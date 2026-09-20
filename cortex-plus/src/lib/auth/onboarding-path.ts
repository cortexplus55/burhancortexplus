/** Profil tamamlanmamış kullanıcıyı yönlendirme (middleware ile uyumlu). */
export function onboardingPathForRole(_role?: string | null): string {
  void _role;
  return "/onboarding";
}
