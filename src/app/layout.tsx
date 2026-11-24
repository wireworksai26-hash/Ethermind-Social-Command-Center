import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Ethermind Social Command Center', template: '%s | Ethermind Command Center' },
  description: 'Multi-brand social media monitoring for Ethermind Agency and Klozer.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#070709',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} ${jbMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
