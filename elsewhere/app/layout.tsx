import type { Metadata } from 'next';
import { Lora, DM_Sans } from 'next/font/google';
import './globals.css';
import { QueryClientProvider } from '@/components/providers/QueryClientProvider';

const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
  display: 'swap',
});

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'elsewhere',
  description: 'go work elsewhere',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${lora.variable} ${dmSans.variable} font-dm-sans antialiased`}>
        <QueryClientProvider>{children}</QueryClientProvider>
      </body>
    </html>
  );
}
