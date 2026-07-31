import { NextResponse, type NextRequest } from 'next/server';

// حماية خفيفة على مستوى الطلب: من لا يملك كوكي جلسة يُحوَّل لصفحة الدخول.
// التحقق الفعلي من صحة الجلسة يتم داخل الصفحات نفسها عبر requireUser().
const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('crm_session');

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (hasSession) return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
