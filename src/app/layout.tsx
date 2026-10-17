import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/config";
import { BRAND_COLOR, THEME_META_COLORS } from "@/lib/brand";
import { AppProviders } from "@/components/providers/AppProviders";
import { FONT_SCALE_STORAGE_KEY, THEME_STORAGE_KEY } from "@/components/providers/storageKeys";
import { TabBar } from "@/components/ui/TabBar";
import { UpdateBanner } from "@/components/ui/UpdateBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false, address: false, email: false },
  icons: {
    // /favicon.ico is linked automatically from src/app/favicon.ico.
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: { "msapplication-TileColor": BRAND_COLOR },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_META_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_META_COLORS.dark },
  ],
};

// Runs before first paint: applies the last-used theme and font scale (mirrored by AppProviders).
const PREPAINT_THEME = [
  "var d=document.documentElement,s=localStorage;",
  `var t=s.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`,
  'if(t==="light"||t==="dark"||t==="sunlight"||t==="system")d.dataset.theme=t;',
].join("");
const PREPAINT_FONT = [
  `var f=parseFloat(s.getItem(${JSON.stringify(FONT_SCALE_STORAGE_KEY)})||"");`,
  'if(f>=1&&f<=2)d.style.setProperty("--font-scale",String(f));',
].join("");
const PREPAINT = `try{${PREPAINT_THEME}${PREPAINT_FONT}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
      </head>
      <body>
        <AppProviders>
          <main id="main" className="app-main">
            {children}
          </main>
          <UpdateBanner />
          <TabBar />
        </AppProviders>
      </body>
    </html>
  );
}
