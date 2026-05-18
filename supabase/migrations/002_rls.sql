-- ============================================================
-- HELPER: check if current user is a member of an org
-- ============================================================
CREATE OR REPLACE FUNCTION is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND joined_at IS NOT NULL
  );
$$;

-- Check if current user has admin or owner role
CREATE OR REPLACE FUNCTION is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND joined_at IS NOT NULL
  );
$$;

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE orgs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources          ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ORGS
-- ============================================================
CREATE POLICY "members can view their orgs"
  ON orgs FOR SELECT USING (is_org_member(id));

CREATE POLICY "owners can update their org"
  ON orgs FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = id AND user_id = auth.uid() AND role = 'owner' AND joined_at IS NOT NULL
    )
  );

-- ============================================================
-- ORG MEMBERS
-- ============================================================
CREATE POLICY "members can view org members"
  ON org_members FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "admins can insert members (invite)"
  ON org_members FOR INSERT WITH CHECK (is_org_admin(org_id));

CREATE POLICY "admins can update members"
  ON org_members FOR UPDATE USING (is_org_admin(org_id));

CREATE POLICY "admins can delete members"
  ON org_members FOR DELETE USING (is_org_admin(org_id));

-- Allow users to update their own membership (joining via invite)
CREATE POLICY "users can accept their own invite"
  ON org_members FOR UPDATE
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RESOURCES
-- ============================================================
CREATE POLICY "members can view resources"
  ON resources FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "admins can manage resources"
  ON resources FOR ALL USING (is_org_admin(org_id));

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE POLICY "members can view projects"
  ON projects FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "admins can manage projects"
  ON projects FOR ALL USING (is_org_admin(org_id));

-- ============================================================
-- TAGS
-- ============================================================
CREATE POLICY "members can view tags"
  ON tags FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "admins can manage tags"
  ON tags FOR ALL USING (is_org_admin(org_id));

-- ============================================================
-- TASKS
-- ============================================================
CREATE POLICY "members can view tasks"
  ON tasks FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "members can manage tasks"
  ON tasks FOR ALL USING (is_org_member(org_id));

-- ============================================================
-- OPERATION LOG
-- ============================================================
CREATE POLICY "members can view operation log"
  ON operation_log FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "members can insert operations"
  ON operation_log FOR INSERT WITH CHECK (is_org_member(org_id));

-- ============================================================
-- INTEGRATION TOKENS
-- ============================================================
CREATE POLICY "members can view own tokens"
  ON integration_tokens FOR SELECT
  USING (is_org_member(org_id) AND member_id IN (
    SELECT id FROM org_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "members can manage own tokens"
  ON integration_tokens FOR ALL
  USING (member_id IN (
    SELECT id FROM org_members WHERE user_id = auth.uid()
  ));
