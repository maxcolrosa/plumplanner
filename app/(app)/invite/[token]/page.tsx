import { acceptInvite } from '@/actions/orgs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>You&apos;ve been invited</CardTitle>
          <CardDescription>
            Accept the invite to join your team on Plum Planner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              'use server'
              await acceptInvite(token)
            }}
          >
            <Button type="submit" className="w-full">
              Accept invite and join team →
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
