import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  icons: { icon: '/brand/sandbox-logo.png', apple: '/brand/sandbox-logo.png' },
  title: 'Sandbox Royale | Play with friends',
  description:
    'Play a 3D battle royale with friends. Create a room, share the code, and outlast everyone on the sandbox.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
