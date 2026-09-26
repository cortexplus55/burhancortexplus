"use client";

import { createContext, useContext } from "react";
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
