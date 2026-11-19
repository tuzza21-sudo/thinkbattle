-- Hotfix for 20270104000000_lounge_turn_lease.sql as first written (2026-11-19): it redefined claim_voice_lounge_host from 20261110 and so
-- brought back the 120-turn limit for a one-to-one chat, which 20261208000000_lounge_room_state.sql had lifted (`AND NOT r.companion_chat`).
-- Every chat past 120 turns got no reply. This puts the exception back in the live definition, keeping the 15-second lease.
DO $$ DECLARE definition text; patched text; BEGIN
 SELECT pg_get_functiondef('public.claim_voice_lounge_host(text,text)'::regprocedure) INTO definition;
 patched:=replace(definition,'OR r.ai_turns>=120','OR (r.ai_turns>=120 AND NOT r.companion_chat)');
 IF patched<>definition THEN EXECUTE patched; END IF;
END $$;
