export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push("Şifre en az 8 karakter olmalı.");
  if (!/[A-ZĞÜŞİÖÇ]/.test(password)) issues.push("En az bir büyük harf gerekli.");
  if (!/[a-zğüşıöç]/.test(password)) issues.push("En az bir küçük harf gerekli.");
  if (!/[0-9]/.test(password)) issues.push("En az bir rakam gerekli.");
  return issues;
}

export function isPasswordValid(password: string) {
  return passwordIssues(password).length === 0;
}
