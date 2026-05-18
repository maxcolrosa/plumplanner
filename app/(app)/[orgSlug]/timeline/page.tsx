interface Props {
  params: Promise<{ orgSlug: string }>
}

export default async function TimelinePage({ params }: Props) {
  const { orgSlug } = await params
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <p>Timeline coming in Plan 3 — {orgSlug}</p>
    </div>
  )
}
