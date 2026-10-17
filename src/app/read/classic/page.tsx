import type { Metadata } from "next";
import { Suspense } from "react";
import { ClassicScreen } from "@/components/reader/ClassicScreen";

export const metadata: Metadata = { title: "Reading" };

export default function ClassicPage() {
  return (
    <Suspense fallback={<p className="my-6 text-muted">Loading…</p>}>
      <ClassicScreen />
    </Suspense>
  );
}
