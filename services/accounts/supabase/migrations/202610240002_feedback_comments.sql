begin;
alter table public.launcher_feedback add column extra_feedback text not null default ''
  check (length(extra_feedback) <= 2000);

-- Keep the original endpoint usable during rollout. All six required questions
-- still pass through its existing validation; comments cannot alter that schema.
create function public.feedback_submit_with_comment(p_id uuid, p_version integer, p_answers jsonb, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
declare already_saved boolean;
begin
  if p_comment is null or length(p_comment) > 2000 then
    raise exception 'Invalid written feedback' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(240001);
  select exists(select 1 from public.launcher_feedback where id = p_id) into already_saved;
  perform public.feedback_submit(p_id, p_version, p_answers);
  if not already_saved then
    update public.launcher_feedback set extra_feedback = btrim(p_comment) where id = p_id;
  end if;
end; $$;
revoke all on function public.feedback_submit_with_comment(uuid,integer,jsonb,text) from public, anon, authenticated;
grant execute on function public.feedback_submit_with_comment(uuid,integer,jsonb,text) to service_role;
commit;
