-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ORGS
-- ============================================================
CREATE TABLE orgs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  plan_tier    text NOT NULL DEFAULT 'starter' CHECK (plan_tier IN ('starter', 'team', 'agency')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  settings     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ORG MEMBERS
-- ============================================================
CREATE TABLE org_members (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_email text,
  invite_token  text UNIQUE,
  joined_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_members_org_id ON org_members(org_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_invite_token ON org_members(invite_token);

-- ============================================================
-- RESOURCES
-- ============================================================
CREATE TABLE resources (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name         text NOT NULL,
  email        text,
  avatar_url   text,
  icon_type    text NOT NULL DEFAULT 'person' CHECK (icon_type IN ('person', 'room', 'equipment')),
  working_week jsonb NOT NULL DEFAULT '{
    "mon": "full", "tue": "full", "wed": "full",
    "thu": "full", "fri": "full", "sat": "none", "sun": "none"
  }',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_resources_org_id ON resources(org_id);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6366f1',
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_org_id ON projects(org_id);

-- ============================================================
-- TAGS
-- ============================================================
CREATE TABLE tags (
  id     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name   text NOT NULL,
  color  text NOT NULL DEFAULT '#6366f1'
);
CREATE INDEX idx_tags_org_id ON tags(org_id);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE tasks (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  resource_id           uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  project_id            uuid REFERENCES projects(id) ON DELETE SET NULL,
  name                  text NOT NULL,
  type                  text NOT NULL CHECK (type IN ('fixed', 'fluid')),
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'in_progress', 'completed')),
  start_date            date NOT NULL,
  end_date              date NOT NULL,
  duration_hours        numeric NOT NULL CHECK (duration_hours > 0),
  actual_duration_hours numeric,
  position              integer,
  task_group_id         uuid,
  segment_index         integer,
  constraints           jsonb NOT NULL DEFAULT '[]',
  tags                  text[] NOT NULL DEFAULT '{}',
  external_ref          jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_org_id ON tasks(org_id);
CREATE INDEX idx_tasks_resource_id ON tasks(resource_id);
CREATE INDEX idx_tasks_start_date ON tasks(start_date);
CREATE INDEX idx_tasks_task_group_id ON tasks(task_group_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- OPERATION LOG (for real-time reconciliation)
-- ============================================================
CREATE TABLE operation_log (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  resource_id    uuid,
  operation_type text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}',
  client_id      text,
  applied_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_operation_log_org_id ON operation_log(org_id);
CREATE INDEX idx_operation_log_applied_at ON operation_log(applied_at);

-- ============================================================
-- INTEGRATION TOKENS
-- ============================================================
CREATE TABLE integration_tokens (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  provider      text NOT NULL
                  CHECK (provider IN ('google_calendar', 'outlook', 'slack', 'github', 'linear')),
  access_token  text NOT NULL,
  refresh_token text,
  expires_at    timestamptz,
  settings      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, member_id, provider)
);
CREATE INDEX idx_integration_tokens_org_id ON integration_tokens(org_id);
