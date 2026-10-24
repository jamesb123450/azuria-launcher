begin;
-- Anonymous by construction: no account, email, IP, user agent or free text.
create table public.launcher_feedback (
  id uuid primary key,
  version integer not null check (version = 1),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  submitted_on date not null default current_date
);
alter table public.launcher_feedback enable row level security;
revoke all on public.launcher_feedback from public, anon, authenticated;
create index feedback_by_date on public.launcher_feedback(submitted_on desc, id);

create function azuria_private.feedback_schema() returns jsonb
language sql immutable set search_path = '' as $schema$ select '
{"version":1,"questions":[{"id":"launchers","title":"What launcher do you currently use?","options":[["modrinth","Modrinth"],["curseforge","CurseForge"],["dawn","Dawn"],["lunar","Lunar Client"],["prism","Prism Launcher"],["gdlauncher","GDLauncher"],["minecraft","Normal Minecraft Launcher"],["azuria","Azuria Launcher"],["other","Another launcher"],["none","I don’t currently use a launcher"]]},{"id":"appeal","title":"What do you find most appealing about your chosen launcher?","options":[["simple","Easy to use"],["design","How it looks"],["speed","Fast startup and good performance"],["mods","Installing mods and modpacks"],["profiles","Keeping versions and profiles organised"],["reliable","It works reliably"],["social","Friends and social features"],["skins","Skins and personalisation"],["familiar","I’m familiar with it"],["none","Nothing in particular / not applicable"]]},{"id":"priorities","title":"What do you want to see most in a launcher?","options":[["navigation","Good navigation"],["looks","Looks nice"],["performance","Fast and lightweight"],["reliability","Reliable launches and updates"],["mods","Easy mod and modpack installation"],["versions","Simple version and loader selection"],["privacy","Privacy and account security"],["customisation","Themes and personalisation"],["social","Friends and messaging"],["help","Useful error messages and troubleshooting"],["accessibility","Accessibility options"]]},{"id":"frustrations","title":"What frustrates you about launchers?","options":[["slow","Slow startup or high memory use"],["clutter","Cluttered or confusing screens"],["errors","Launch errors or crashes"],["mods","Difficult mod management"],["updates","Disruptive updates"],["accounts","Problems signing in"],["ads","Too many ads"],["none","No major frustrations"]]},{"id":"azuria","title":"What would make you more likely to try or keep using Azuria?","options":[["polish","A polished, easy-to-use design"],["speed","Better performance"],["mods","Modrinth and CurseForge support"],["social","Friends and messaging"],["reliability","Reliable launches"],["privacy","Clear privacy and security practices"],["customisation","More personalisation"],["recommendation","A recommendation from someone I trust"],["happy","I already use Azuria and I’m happy with it"],["unsure","I’m not sure yet"]]},{"id":"playstyle","title":"How do you usually play Minecraft?","options":[["vanilla","Vanilla"],["mods","With individual mods"],["modpacks","Modpacks"],["servers","Multiplayer servers"],["singleplayer","Single-player worlds"],["creative","Creative building"],["returning","I’m new or returning to Minecraft"]]}]}
'::jsonb $schema$;
revoke all on function azuria_private.feedback_schema() from public, anon, authenticated;

create function public.feedback_submit(p_id uuid, p_version integer, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare question jsonb; selected jsonb; option_count integer;
begin
  if p_id is null or p_version is distinct from 1 or p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or octet_length(p_answers::text) > 8192 then raise exception 'Invalid feedback' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) <> 6 then raise exception 'Invalid questions' using errcode = '22023'; end if;
  for question in select value from jsonb_array_elements(azuria_private.feedback_schema()->'questions') loop
    selected := p_answers->(question->>'id');
    if selected is null or jsonb_typeof(selected) <> 'array' then raise exception 'Missing answers' using errcode = '22023'; end if;
    option_count := jsonb_array_length(selected);
    if option_count < 1 or option_count > jsonb_array_length(question->'options')
      or (select count(distinct value) from jsonb_array_elements(selected)) <> option_count
      or exists (select 1 from jsonb_array_elements(selected) a where not exists
        (select 1 from jsonb_array_elements(question->'options') o where o->0 = a.value)) then
      raise exception 'Invalid selections' using errcode = '22023'; end if;
  end loop;
  -- Retrying a timed-out submission never creates a second response or overwrites one.
  perform pg_advisory_xact_lock(240001);
  if exists(select 1 from public.launcher_feedback where id = p_id) then return; end if;
  if (select count(*) from public.launcher_feedback where submitted_on = current_date) >= 5000 then
    raise exception 'Survey daily limit reached' using errcode = 'P0001'; end if;
  insert into public.launcher_feedback(id,version,answers) values(p_id,p_version,p_answers);
end; $$;
revoke all on function public.feedback_submit(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.feedback_submit(uuid,integer,jsonb) to service_role;

create function public.feedback_admin_summary() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare totals jsonb;
begin
  perform azuria_private.require_admin();
  select coalesce(jsonb_object_agg(question_id, counts), '{}'::jsonb) into totals from (
    select question_id, jsonb_object_agg(option_id, votes) counts from (
      select a.key question_id, choice.value option_id, count(*) votes
      from public.launcher_feedback r cross join lateral jsonb_each(r.answers) a
      cross join lateral jsonb_array_elements_text(a.value) choice
      group by a.key, choice.value
    ) choices group by question_id
  ) questions;
  return jsonb_build_object('schema',azuria_private.feedback_schema(), 'total', (select count(*) from public.launcher_feedback), 'counts',totals);
end; $$;
create function public.feedback_admin_responses(p_offset integer default 0) returns setof public.launcher_feedback
language plpgsql security definer set search_path = '' as $$
begin
  perform azuria_private.require_admin();
  if p_offset is null or p_offset < 0 or p_offset > 100000 then raise exception 'Invalid page' using errcode = '22023'; end if;
  return query select * from public.launcher_feedback order by submitted_on desc,id limit 25 offset p_offset;
end; $$;
revoke all on function public.feedback_admin_summary(), public.feedback_admin_responses(integer) from public, anon, authenticated;
grant execute on function public.feedback_admin_summary(), public.feedback_admin_responses(integer) to authenticated;
commit;
