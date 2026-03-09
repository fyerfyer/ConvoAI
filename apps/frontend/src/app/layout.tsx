import './global.css';
import { Toaster } from '@/components/ui/toaster';
import Providers from '@/providers/providers';

export const metadata = {
  title: 'ConvoAI',
  description:
    'AI-Native Real-Time Communication Platform — Discord-like chat with intelligent Agents, long-term memory, and automated moderation',
  icons: {
    icon: '/icon.svg',
  },
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
