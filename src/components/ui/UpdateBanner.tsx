"use client";

import { useState } from "react";
import { useAppUpdate } from "@/components/providers/AppProviders";
import { Button } from "./Button";

/** "Update available" banner, above the TabBar (and ActionBar when present). Tapping Update activates the waiting service worker and reloads. */
export function UpdateBanner() {
  const { updateAvailable, applyUpdate } = useAppUpdate();
  const [busy, setBusy] = useState(false);
  if (!updateAvailable) return null;
  return (
    <div
      role="status"
      className="update-banner bordered fixed inset-x-0 z-[35] mx-auto flex max-w-[44rem] items-center gap-3 bg-surface px-4 py-2"
    >
      <p className="flex-1 font-semibold">Update available</p>
      <Button
        variant="primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          applyUpdate();
        }}
      >
        Update
      </Button>
    </div>
  );
}
