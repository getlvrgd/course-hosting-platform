import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { FaviconSync } from "@/components/FaviconSync";
import { THEME_SCRIPT } from "@/components/ThemeToggle";

import "./globals.css";

/**
 * Two tab icons, not one: the LVRGD mark is solid black and solid white, and neither
 * reads against both tab strips. The `media` queries pick the right one for the OS
 * setting before any JavaScript runs; FaviconSync then keeps it honest for anyone who
 * has overridden that with the in-app theme toggle.
 *
 * `app/favicon.ico` is deliberately absent — the file convention emits its own
 * unconditional <link>, which would outrank these and pin one mark for everybody.
 */
export const metadata: Metadata = {
  title: "Course Hub",
  description: "The courses, and how far everyone has got through them",
  // Kept out of search results. The login wall is the control; this is tidiness.
  robots: { index: false, follow: false },
  icons: {
    icon: [
      {
        url: "/icon-light.png",
        type: "image/png",
        sizes: "64x64",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark.png",
        type: "image/png",
        sizes: "64x64",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

/**
 * Headings are Inter Extra Bold at -8% tracking; body text is still the OS face.
 *
 * SF cannot be shipped as a webfont — Apple licenses it for macOS and iOS only — so
 * the running text asks the operating system for it and lands on the platform's own UI
 * face elsewhere. Inter is open source, so it can be self-hosted, and it is loaded
 * only for headings: one file, one weight, on the type that carries the brand.
 *
 * next/font downloads it at build time and serves it from this origin, so there is no
 * request to Google at runtime and no flash of unstyled text.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["800"],
  display: "swap",
  variable: "--font-display",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme before first paint, so a dark-mode user never
            sees a white flash. Must run ahead of React. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <FaviconSync />
        {children}
      </body>
    </html>
  );
}
