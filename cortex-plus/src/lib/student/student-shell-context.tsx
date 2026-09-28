"use client";

import { createContext, useContext } from "react";
import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";
import type { StudentAccountContext } from "@/lib/student/account-context";

const StudentShellContext = createContext<StudentAccountContext | undefined>(
  undefined,
);

export function StudentShellProvider({
  account,
  children,
}: {
  account?: StudentAccountContext;
  children: React.ReactNode;
}) {
  return (
    <StudentShellContext.Provider value={account}>
      {children}
    </StudentShellContext.Provider>
  );
}

export function useStudentShellAccount() {
  return useContext(StudentShellContext);
}

/**
 * Kurucu / yönetici hesabı mı. Değer sunucunun kurduğu kabuk bağlamından
 * gelir (`getStudentAccountContext`); tarayıcı ayrıca sormaz, localStorage ya
 * da çerez okunmaz. Satın alma yüzeyleri buna bakıp hiç render edilmez.
 */
export function useIsFounder(): boolean {
  return useContext(StudentShellContext)?.isAdmin === true;
}

/** Belge yükleme kotası — kurucuda ve ücretli kademede sayfa tavanı gösterilmez. */
export function useDocumentLimits(): {
  isAdmin: boolean;
  freePdfCap: number | null;
  showQuota: boolean;
} {
  const account = useContext(StudentShellContext);
  const isAdmin = account?.isAdmin === true;
  const audience = account?.audience;
  const isFree = audience === "free" || audience === undefined;
  const freePdfCap =
    isAdmin || !isFree ? null : PHOTO_PAGE_LIMITS.free;
  const showQuota = !isAdmin && isFree;
  return { isAdmin, freePdfCap, showQuota };
}
