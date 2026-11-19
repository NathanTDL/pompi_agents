import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";
import { ConvexClientProvider } from "@/components/providers/convex-provider";

export const metadata: Metadata = {
  title: "Pompi — your AI teammates on an infinite canvas",
  description: "Pompi is like FigJam, but your teammates are AI agents. Write what you want on the canvas, and the right agent walks over and does it.",
  applicationName: "Pompi",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialToken: string | null = null;
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    try {
      const { getToken } = await import("@/lib/auth-server");
      initialToken = (await getToken()) ?? null;
    } catch {
      initialToken = null;
    }
  }
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        <ConvexClientProvider initialToken={initialToken}>{children}</ConvexClientProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
