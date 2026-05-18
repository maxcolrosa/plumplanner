-- Any authenticated user can create an org (they become owner via org_members insert)
CREATE POLICY "authenticated users can create orgs"
  ON orgs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Any authenticated user can insert their own membership (needed for createOrg owner insert)
-- The org_members INSERT policy currently requires is_org_admin, which fails for the very
-- first member insert (you can't be admin of an org that has no members yet).
-- We allow INSERT when the user is setting themselves as the owner of a brand-new org,
-- or when an existing admin is inviting someone. Use service role for the owner bootstrap.
DROP POLICY IF EXISTS "admins can insert members (invite)" ON org_members;

CREATE POLICY "admins can insert members (invite)"
  ON org_members FOR INSERT
  WITH CHECK (
    -- Existing admin inviting someone
    is_org_admin(org_id)
    OR
    -- First member bootstrapping their own ownership (no members exist yet)
    (
      user_id = auth.uid()
      AND role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM org_members om2
        WHERE om2.org_id = org_members.org_id
          AND om2.joined_at IS NOT NULL
      )
    )
  );
