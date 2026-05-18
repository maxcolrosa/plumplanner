'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createOrg } from '@/actions/orgs'

export default function OnboardingPage() {
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createOrg(formData)
      if (result?.error) {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Create your organisation</CardTitle>
          <CardDescription>
            Set up your team workspace. You can invite people next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organisation name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Acme Agency"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create organisation →'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
