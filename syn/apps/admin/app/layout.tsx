import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = { title: 'SYN — لوحة الإدارة' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <header className="top">
          <b>SYN · لوحة الإدارة</b>
          <Link href="/">نظرة عامة</Link>
          <Link href="/products">المنتجات</Link>
          <Link href="/alerts">الإنذارات الرقابية</Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
