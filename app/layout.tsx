import { Public_Sans } from 'next/font/google';
import localFont from 'next/font/local';
import { headers } from 'next/headers';
import { ApplyThemeScript } from '@/components/apply-theme-script';
import { ThemeToggle } from '@/components/theme-toggle';
import { getAppConfig } from '@/lib/utils';
import './globals.css';

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
});

const commitMono = localFont({
  src: [
    {
      path: './fonts/CommitMono-400-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/CommitMono-700-Regular.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: './fonts/CommitMono-400-Italic.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: './fonts/CommitMono-700-Italic.otf',
      weight: '700',
      style: 'italic',
    },
  ],
  variable: '--font-commit-mono',
});

interface RootLayoutProps {
  children: React.ReactNode;
}

function normalizeHexColor(input: string) {
  const m = input.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return `#${m[1]!.toLowerCase()}`;
}

function darkenHexColor(input: string, amount = 0.12) {
  const hex = normalizeHexColor(input);
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount))));
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(f(r))}${toHex(f(g))}${toHex(f(b))}`;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const hdrs = await headers();
  const { accent, accentDark, pageTitle, pageDescription } = await getAppConfig(hdrs);

  const accentHover = accent ? darkenHexColor(accent) : null;
  const accentDarkHover = accentDark ? darkenHexColor(accentDark) : null;

  const styles = [
    accent
      ? `:root { --primary: ${accent};${accentHover ? ` --primary-hover: ${accentHover};` : ''} }`
      : '',
    accentDark
      ? `.dark { --primary: ${accentDark};${
          accentDarkHover ? ` --primary-hover: ${accentDarkHover};` : ''
        } }`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
      <head>
        {styles && <style>{styles}</style>}
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <ApplyThemeScript />
      </head>
      <body
        className={`${publicSans.variable} ${commitMono.variable} overflow-x-hidden antialiased`}
      >
        {children}
        <div className="group fixed bottom-0 left-1/2 z-50 mb-2 -translate-x-1/2">
          <ThemeToggle className="translate-y-20 transition-transform delay-150 duration-300 group-hover:translate-y-0" />
        </div>
      </body>
    </html>
  );
}
