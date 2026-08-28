import type { ReactNode } from "react";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { StudentAccountStrip } from "@/components/student/student-account-strip";

export function StudentPageShell({
  account,
  creditHint,
  intro,
  children,
  hideAccountStrip,
}: {
  account: StudentAccountContext;
  creditHint?: string;
  intro?: ReactNode;
  children: ReactNode;
  hideAccountStrip?: boolean;
}) {
  return (
    <div className="space-y-4 pb-4">
      {!hideAccountStrip ? (
        <StudentAccountStrip account={account} creditHint={creditHint} />
      ) : null}
      {intro}
      {children}
    </div>
  );
}
