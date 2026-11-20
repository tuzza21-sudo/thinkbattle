-- Apply in the Supabase SQL editor (migrations are not applied on merge). Until it is applied the site works as before (an action may be counted again).
-- (2026-11-20) Each Meta event (CompleteRegistration, FirstConversation, ConversationEngaged) counts once per member. api/meta-events.ts
-- claims (member, event) here before it relays to Meta's conversions API; a repeat from another browser or device is answered as a duplicate and the
-- page does not fire its pixel either. Meta showed 37 registrations for 15 members because the record was kept per browser.
-- Only the service key reads or writes it. A deleted account takes its rows with it.
BEGIN;

CREATE TABLE IF NOT EXISTS public.meta_event_log (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name IN ('CompleteRegistration','FirstConversation','ConversationEngaged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_name)
);
ALTER TABLE public.meta_event_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_event_log FROM PUBLIC, anon, authenticated;

COMMIT;
