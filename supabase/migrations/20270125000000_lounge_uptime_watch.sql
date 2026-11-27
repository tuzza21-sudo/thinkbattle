-- Uptime watch inside Supabase (2026-11-27, by the owner). The lounge function stopped again (00:13 UTC, a 문정우
-- lesson): one instance hung (socket hang up, then ECONNREFUSED 127.0.0.1:<port> on every request) until a redeploy.
-- The GitHub watch (.github/workflows/uptime.yml) was meant to look every five minutes, but GitHub started its
-- scheduled runs only every few hours, so it saw nothing. This watch runs in the database with pg_cron and pg_net:
-- every 20 seconds it asks GET https://saseok.kr/api/lounge?health=1; after two misses in a row (about 40 seconds)
-- it starts a redeploy through the Vercel deploy hook and sends an urgent ntfy alert to the owner's phone. If the
-- site still does not answer eight minutes later, it redeploys and alerts again. When the site answers again after
-- an alert, a recovery alert says how long it was down.
--
-- Secrets live in Supabase Vault (not in this file); the owner adds them once in the SQL editor:
--   select vault.create_secret('<Vercel deploy hook URL>', 'lounge_deploy_hook');
--   select vault.create_secret('<ntfy topic>', 'lounge_ntfy_topic');
-- Without the hook it only alerts; without the topic it only redeploys.
-- Test alert: select public.lounge_uptime_notify('사석 서버 알림 시험', '이 알림이 보이면 서버가 멈출 때 알려 드려요.', 3, 'white_check_mark');
-- State: select * from public.lounge_uptime_watch;   Stop it: select cron.unschedule('lounge-uptime-watch');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.lounge_uptime_watch (
  id int primary key default 1 check (id = 1),
  pending_request bigint,
  pending_at timestamptz,
  misses int not null default 0,
  down_since timestamptz,
  alerted boolean not null default false,
  last_redeploy timestamptz,
  last_ok timestamptz,
  last_status int,
  updated_at timestamptz not null default now()
);
alter table public.lounge_uptime_watch enable row level security;
revoke all on public.lounge_uptime_watch from anon, authenticated;
insert into public.lounge_uptime_watch (id) values (1) on conflict (id) do nothing;

create or replace function public.lounge_uptime_secret(secret_name text)
returns text
language sql
security definer
set search_path = public
as $$
  select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets where name = secret_name limit 1
$$;

create or replace function public.lounge_uptime_notify(title text, message text, priority int, tag text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  topic text := public.lounge_uptime_secret('lounge_ntfy_topic');
begin
  if topic is null then return; end if;
  perform net.http_post(
    url := 'https://ntfy.sh/',
    body := jsonb_build_object(
      'topic', topic, 'title', title, 'message', message, 'priority', priority,
      'tags', jsonb_build_array(tag), 'click', 'https://saseok.kr'
    ),
    timeout_milliseconds := 10000
  );
end
$$;

create or replace function public.lounge_uptime_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.lounge_uptime_watch%rowtype;
  http_status int;
  answered boolean;
  alive boolean;
  hook text;
  down_minutes int;
begin
  select * into w from public.lounge_uptime_watch where id = 1 for update;

  if w.pending_request is not null then
    select status_code into http_status from net._http_response where id = w.pending_request;
    answered := found;
    if answered then
      -- Any answer from the function below 500 means it is running; a dead instance gives a bare 500 or nothing.
      alive := coalesce(http_status, 0) between 200 and 499;
    elsif w.pending_at < now() - interval '18 seconds' then
      alive := false;
    else
      return;
    end if;

    if alive then
      if w.alerted then
        down_minutes := greatest(1, ceil(extract(epoch from now() - coalesce(w.down_since, w.pending_at)) / 60)::int);
        perform public.lounge_uptime_notify(
          '사석 서버 복구됨', format('saseok.kr이 다시 응답해요. 약 %s분 동안 멈춰 있었어요.', down_minutes), 3, 'white_check_mark'
        );
      end if;
      update public.lounge_uptime_watch
        set misses = 0, down_since = null, alerted = false, last_ok = now(), last_status = http_status
        where id = 1;
    else
      w.misses := w.misses + 1;
      w.down_since := coalesce(w.down_since, w.pending_at);
      if w.misses >= 2 and (w.last_redeploy is null or w.last_redeploy < now() - interval '8 minutes') then
        hook := public.lounge_uptime_secret('lounge_deploy_hook');
        if hook is not null then
          perform net.http_post(url := hook, body := '{}'::jsonb, timeout_milliseconds := 15000);
          w.last_redeploy := now();
          perform public.lounge_uptime_notify(
            '사석 서버 멈춤',
            case when w.alerted
              then '아직 응답이 없어 한 번 더 자동으로 다시 배포하고 있어요. 계속되면 직접 확인해 주세요.'
              else '대화 서버가 응답하지 않아 자동으로 다시 배포하고 있어요. 1~2분 뒤 복구 알림이 와요.'
            end,
            5, 'rotating_light'
          );
          w.alerted := true;
        elsif not w.alerted then
          perform public.lounge_uptime_notify(
            '사석 서버 멈춤', '대화 서버가 응답하지 않아요. 자동 배포가 설정되지 않아 직접 다시 배포해야 해요.', 5, 'rotating_light'
          );
          w.alerted := true;
        end if;
      end if;
      update public.lounge_uptime_watch
        set misses = w.misses, down_since = w.down_since, alerted = w.alerted, last_redeploy = w.last_redeploy,
            last_status = http_status
        where id = 1;
    end if;
  end if;

  update public.lounge_uptime_watch
    set pending_request = net.http_get(
          url := 'https://saseok.kr/api/lounge',
          params := jsonb_build_object('health', '1', 't', floor(extract(epoch from now()))::bigint::text),
          timeout_milliseconds := 12000
        ),
        pending_at = now(),
        updated_at = now()
    where id = 1;
end
$$;

-- Supabase exposes public functions over PostgREST: only the database itself may run these.
revoke execute on function public.lounge_uptime_secret(text) from public, anon, authenticated;
revoke execute on function public.lounge_uptime_notify(text, text, int, text) from public, anon, authenticated;
revoke execute on function public.lounge_uptime_tick() from public, anon, authenticated;

select cron.schedule('lounge-uptime-watch', '20 seconds', $$select public.lounge_uptime_tick()$$);
-- Every 20 seconds adds a row to cron.job_run_details; keep one day of them.
select cron.schedule(
  'lounge-uptime-watch-cleanup', '17 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '1 day'$$
);
