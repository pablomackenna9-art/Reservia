import type { ReactNode } from "react";
import { TopBar } from "./TopBar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
