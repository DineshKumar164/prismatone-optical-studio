import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#07080c',
};

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Prismatone Optical Simulation Studio',
  description:
    'GPU-accelerated cinema camera sensor and optical lens simulation workstation built with Next.js, TypeScript, WebGPU/WGSL, WebGL2, Three.js, WebCodecs, and PostgreSQL.',
  openGraph: {
    title: 'Prismatone Optical Simulation Studio',
    description:
      'GPU-accelerated cinema camera sensor and optical lens simulation workstation built with Next.js, TypeScript, WebGPU/WGSL, WebGL2, Three.js, WebCodecs, and PostgreSQL.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Prismatone Optical Simulation Studio',
    description:
      'GPU-accelerated cinema camera sensor and optical lens simulation workstation built with Next.js, TypeScript, WebGPU/WGSL, WebGL2, Three.js, WebCodecs, and PostgreSQL.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#090a0f] text-slate-100 font-sans antialiased selection:bg-amber-500/30 selection:text-amber-200"
      >
        {children}
      </body>
    </html>
  );
}
