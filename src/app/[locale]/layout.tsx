import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import '../globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'keelblock',
  description: 'Multi-tenant SaaS starter with tenant isolation proven on every commit.',
};

// Prerender one route tree per locale. Adding a language changes this list and nothing else.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // From the route segment, not from headers — see src/i18n/request.ts for why that matters here.
  const locale = await getLocale();

  return (
    // The font variables belong on `<html>`, not on `<body>`, and the difference was two months of
    // serif. `globals.css` applies `font-sans` to `html`, which resolves `var(--font-geist-sans)` at
    // the ROOT — and `next/font` was defining that variable one level down, on `<body>`, where the
    // root cannot see it. A custom property that is out of scope is not an error: the declaration is
    // simply dropped and the element falls back to the browser default (F-70).
    //
    // It also makes the fonts consistent with every other token in this project: `--background`,
    // `--foreground` and the rest all live on `:root`, which is this element.
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
