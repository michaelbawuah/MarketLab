import { NextResponse, type NextRequest } from 'next/server';
export function middleware(request:NextRequest) {
  const response=NextResponse.next();
  if(request.nextUrl.pathname==='/example'||request.nextUrl.pathname.startsWith('/share/')||request.nextUrl.pathname.startsWith('/api/shared/')||request.nextUrl.pathname.startsWith('/discussion/')||request.nextUrl.pathname.startsWith('/api/discussion/')||request.nextUrl.pathname.startsWith('/api/discussion-auth/')||request.nextUrl.pathname==='/api/research/discussion') {
    response.headers.set('Cache-Control','private, no-store, max-age=0');
    response.headers.set('Referrer-Policy','no-referrer');
    response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
    response.headers.set('X-Content-Type-Options','nosniff');
    response.headers.set('Content-Security-Policy',"frame-ancestors 'none'");
  }
  return response;
}
export const config={matcher:['/example','/share/:path*','/api/shared/:path*','/discussion/:path*','/api/discussion/:path*','/api/discussion-auth/:path*','/api/research/discussion']};
