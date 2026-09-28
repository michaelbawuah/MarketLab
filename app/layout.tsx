import type { Metadata } from 'next';
import './globals.css';
import './consumer.css';
import './planning.css';
export const metadata:Metadata={title:'MarketLab · Portfolio intelligence',description:'Understand your portfolio. Trace every number.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
