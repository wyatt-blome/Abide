import type { ReactNode } from "react";
import { Card } from "@/components/ui";

export function SettingsBlock({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <Card title={title} id={id} className="mt-4 flex scroll-mt-4 flex-col gap-4">
      {children}
    </Card>
  );
}
