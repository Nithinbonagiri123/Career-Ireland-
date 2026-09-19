import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fetchAppSettings } from '@/modules/settings/read';
import './globals.css';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/**
 * Root metadata is derived from `app_settings.legalName` so the browser
 * tab, share previews, and PWA title all reflect the customer's brand —
 * no hardcoded product name. Falls back gracefully if the singleton row
 * is missing (never render `undefined`).
 *
 * The `title.template` string is what Next.js uses to compose child-page
 * titles: any page that exports `title: 'Candidates'` will render as
 * `'Candidates · <brand>'` in the tab. Child pages can therefore drop
 * the brand suffix — it's supplied automatically here.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await fetchAppSettings();
    return {
      title: {
        default: `${settings.legalName} CRM`,
        template: `%s · ${settings.legalName}`,
      },
      description: `Internal CRM for ${settings.legalName}`,
    };
  } catch {
    return {
      title: { default: 'CRM', template: '%s · CRM' },
      description: 'Internal CRM',
    };
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delay={200}>
            {children}
            {/* Toaster wrapper — hidden on print so success/error toasts
                never leak into customer-facing PDFs. */}
            <div className="print:hidden">
              <Toaster richColors closeButton />
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
