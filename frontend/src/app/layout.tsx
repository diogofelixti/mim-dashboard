import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MIM-Dashboard',
  description: 'Magic Internet Money — Bitcoin Core Node Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-mim-bg text-mim-text min-h-screen">
        {children}
      </body>
    </html>
  );
}
