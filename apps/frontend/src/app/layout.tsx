import './global.css';
import { Toaster } from '@/components/ui/toaster';
import Providers from '@/providers/providers';

export const metadata = {
  title: 'Discord Platform',
  description: 'A modern Discord platform built with Next.js',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
