'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { signIn, signInWithGoogle } from '@/actions/auth'

export default function SignInPage() {
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await signIn(formData)
      if (result?.error) {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
      {/* Logo (mobile only) */}
      <div className="flex items-center gap-2 mb-6 lg:hidden">
        <div className="w-7 h-7 rounded-[6px] bg-plum-cta" />
        <span className="font-bold text-[15px]">Plum Planner</span>
      </div>

      <h1 className="text-[20px] font-bold text-foreground mb-1">Welcome back</h1>
      <p className="text-[13px] text-muted-foreground mb-6">Sign in to your account</p>

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-[13px] font-medium text-foreground mb-1.5">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="sarah@agency.com"
            required
            className="w-full h-9 px-3 rounded-[var(--radius)] border border-input bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors duration-150"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-[13px] font-medium text-foreground mb-1.5">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full h-9 px-3 rounded-[var(--radius)] border border-input bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors duration-150"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full h-9 rounded-[var(--radius)] bg-plum-cta text-white text-[13px] font-semibold disabled:opacity-50 transition-[filter] duration-150 hover:brightness-110"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10)' }}
        >
          {isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-[11px] text-muted-foreground uppercase tracking-wide">or</span>
        </div>
      </div>

      <form action={async () => { await signInWithGoogle() }}>
        <button
          type="submit"
          className="w-full h-9 rounded-[var(--radius)] border border-border bg-card text-[13px] font-medium text-foreground hover:bg-plum-surface-raised transition-colors duration-150"
        >
          Continue with Google
        </button>
      </form>

      <p className="text-center text-[13px] text-muted-foreground mt-5">
        Don&apos;t have an account?{' '}
        <Link href="/sign-up" className="text-plum-accent font-medium hover:underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  )
}
