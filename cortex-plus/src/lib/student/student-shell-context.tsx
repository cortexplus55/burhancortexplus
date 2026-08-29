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
