import type { Metadata, Viewport } from "next";
import { Lora, DM_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { QueryClientProvider } from "@/components/providers/QueryClientProvider";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "elsewhere",
  description: "go work elsewhere",
  applicationName: "elsewhere",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#EFEBE0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${lora.variable} ${dmSans.variable} font-dm-sans antialiased`}
        suppressHydrationWarning
      >
        {/* Extra boundary: Chrome mobile injects __gchrome_* on nested nodes, not only body */}
        <Providers>
          <div suppressHydrationWarning className="min-h-0">
            <QueryClientProvider>{children}</QueryClientProvider>
          </div>
        </Providers>
      </body>
    </html>
  );
}
