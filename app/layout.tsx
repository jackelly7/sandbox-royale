import type { Metadata } from 'next';
import { Barlow_Condensed, DM_Sans } from 'next/font/google';
import './globals.css';
const display = Barlow_Condensed({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
});
const body = DM_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});
export const metadata: Metadata = {
  title: 'LASTLIGHT | Solo Battle Royale',
  description:
    'Drop onto Lastlight Island. Gear up, outrun the storm, and outlast 15 rivals in a first-person 3D battle royale.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
