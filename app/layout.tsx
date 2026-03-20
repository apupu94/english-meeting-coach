import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'English Coach',
  description: 'Upgrade your business English from real meeting transcripts',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff' }}>
        {children}
      </body>
    </html>
  );
}
