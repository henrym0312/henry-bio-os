import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { getShellStatus } from '@/lib/ui/telemetry-queries';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'HenryBioOS — Personal Biometric Telemetry Warehouse',
  description:
    'Personal biometric repository, telemetry warehouse, and cross-domain analytics platform.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const status = await getShellStatus();

  return (
    <html lang="en-GB" className="dark">
      <body className="min-h-screen bg-[#0A0A0A] text-[#F5F5F7] antialiased font-sans">
        <AppShell status={status}>{children}</AppShell>
      </body>
    </html>
  );
}
