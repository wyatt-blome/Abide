import type { Metadata } from "next";
import { Suspense } from "react";
import { BookScreen } from "@/components/reader/BookScreen";

export const metadata: Metadata = { title: "Book" };

export default function BookPage() {
  return (
    <Suspense fallback={<p className="my-6 text-muted">Loading…</p>}>
      <BookScreen />
    </Suspense>
  );
}
