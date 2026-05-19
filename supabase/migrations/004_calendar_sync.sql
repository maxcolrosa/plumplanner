-- supabase/migrations/004_calendar_sync.sql

-- Link person resources to their Plum user account
ALTER TABLE resources
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Per-task opt-in for calendar sync
ALTER TABLE tasks
  ADD COLUMN calendar_sync_enabled boolean NOT NULL DEFAULT false;

-- Stores the external calendar event ID per (task, provider)
CREATE TABLE calendar_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider   text NOT NULL CHECK (provider IN ('google_calendar', 'outlook')),
  event_id   text NOT NULL,
  sync_error boolean NOT NULL DEFAULT false,
  UNIQUE (task_id, provider)
);

CREATE INDEX idx_calendar_events_task_id ON calendar_events(task_id);
CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);

-- RLS: users can see/manage their own calendar event rows
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar events"
  ON calendar_events
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
