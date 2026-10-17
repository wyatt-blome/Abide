import type { Metadata } from "next";
import { Suspense } from "react";
import { ReaderScreen } from "@/components/reader/ReaderScreen";

export const metadata: Metadata = { title: "Reader" };

export default function ReaderPage() {
  return (
    <Suspense fallback={<p className="my-6 text-muted">Loading…</p>}>
      <ReaderScreen />
    </Suspense>
  );
}
