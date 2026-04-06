import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Navigation from "@/components/Navigation";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata = {
  title: "Repetita",
  description: "Remember what you read.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${dmSans.variable} ${dmSerifDisplay.variable} dark`}>
        <body
          className="min-h-dvh"
          style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}
        >
          <Navigation />
          <main className="max-w-2xl mx-auto px-4 pb-24 md:pt-20">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  );
}
