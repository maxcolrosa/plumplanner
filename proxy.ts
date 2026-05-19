import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PROTECTED_PREFIXES = ['/app', '/onboarding', '/invite']
const AUTH_ROUTES = ['/sign-in', '/sign-up']
const ORG_ROUTE_PATTERN = /^\/([a-z0-9][a-z0-9-]{0,48}[a-z0-9])\//

function withCookies(redirect: ReturnType<typeof NextResponse.redirect>, base: NextResponse) {
  base.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
  return redirect
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users away from protected routes
  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p))
  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('next', pathname)
    return withCookies(NextResponse.redirect(url), supabaseResponse)
  }

  // Redirect authenticated users away from auth routes and marketing root
  const isAuthRoute = AUTH_ROUTES.some(p => pathname.startsWith(p))
  if (user && (isAuthRoute || pathname === '/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return withCookies(NextResponse.redirect(url), supabaseResponse)
  }

  // Validate org membership for org-scoped routes
  const orgMatch = pathname.match(ORG_ROUTE_PATTERN)
  if (orgMatch) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/sign-in'
      url.searchParams.set('next', pathname)
      return withCookies(NextResponse.redirect(url), supabaseResponse)
    }

    const orgSlug = orgMatch[1]

    const { data: member } = await supabase
      .from('org_members')
      .select('id, role, org_id, orgs!inner(slug, plan_tier)')
      .eq('user_id', user.id)
      .eq('orgs.slug', orgSlug)
      .not('joined_at', 'is', null)
      .single()

    if (!member) {
      const url = request.nextUrl.clone()
      url.pathname = '/app'
      return withCookies(NextResponse.redirect(url), supabaseResponse)
    }
  }

  supabaseResponse.headers.set('x-pathname', request.nextUrl.pathname)
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
