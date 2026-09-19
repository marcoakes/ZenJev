import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from './server/auth';
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  try { await authenticate(request); return NextResponse.next(); }
  catch { return NextResponse.redirect(new URL('/login', request.url)); }
}
export const config = { matcher: ['/((?!_next/static|_next/image|branding/|favicon.ico).*)'] };
