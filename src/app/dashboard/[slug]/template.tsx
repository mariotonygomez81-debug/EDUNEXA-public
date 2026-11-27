"use client";

import { usePathname } from "next/navigation";

/**
 * Lightweight route transition for the institutional workspace.
 * The keyed wrapper remounts on client-side route changes, allowing CSS
 * to animate entry without effects, timers, or extra React state.
 */
export default function WorkspaceRouteTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="workspace-route-transition" aria-live="polite">
      {children}
    </div>
  );
}
