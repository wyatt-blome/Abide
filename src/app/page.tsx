import type { Metadata } from "next";
import { APP_NAME } from "@/config";
import { TodayScreen } from "@/components/reader/TodayScreen";

// The root layout's title template does not apply to its own segment, so the full title is given.
export const metadata: Metadata = { title: { absolute: `Today · ${APP_NAME}` } };

export default function TodayPage() {
  return <TodayScreen />;
}
