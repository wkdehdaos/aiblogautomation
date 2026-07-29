import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: '블로디(Blogdy) - AI 블로그 자동 작성',
  description: 'AI가 블로그 글을 자동으로 작성하고 네이버 블로그에 발행해드립니다.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  )
}
