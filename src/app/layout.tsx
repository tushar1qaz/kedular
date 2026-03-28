import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kedular — The Intelligent Schedule Workbench',
  description:
    'Upload P6 XER or MS Project files. Get instant look-aheads, burn-down charts, slippage analysis, and an AI schedule agent. Edit, validate, export back.',
  openGraph: {
    title: 'Kedular — The Intelligent Schedule Workbench',
    description:
      'Upload P6 XER or MS Project files. Get instant look-aheads, burn-down charts, slippage analysis, and an AI schedule agent. Edit, validate, export back.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
