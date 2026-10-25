begin;
-- Preserve administrator history after removing an expired campaign.
alter table public.sponsor_ad_history drop constraint sponsor_ad_history_ad_id_fkey;
alter table public.sponsor_ad_history add column action text not null default 'saved'
 check(action in ('saved','deleted'));
create function public.sponsor_ads_admin_delete(p_id uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := azuria_private.require_admin(); n public.sponsor_ads;
begin
 -- Use the same lock as campaign saves so rescheduling and deletion serialize.
 perform pg_catalog.pg_advisory_xact_lock(250001);
 select * into n from public.sponsor_ads where id=p_id for update;
 if not found then raise exception 'Advertisement no longer exists' using errcode='22023'; end if;
 if p_revision is null or p_revision <> n.revision then
  raise exception 'Advertisement changed. Reload before deleting.' using errcode='40001'; end if;
 if n.ends_at is null or n.ends_at > now() then
  raise exception 'Only expired advertisements can be deleted' using errcode='22023'; end if;
 insert into public.sponsor_ad_history(ad_id,actor_id,revision,action) values(n.id,actor,n.revision+1,'deleted');
 delete from public.sponsor_ads where id=n.id;
end;
$$;
revoke all on function public.sponsor_ads_admin_delete(uuid,integer) from public,anon,authenticated;
grant execute on function public.sponsor_ads_admin_delete(uuid,integer) to authenticated;
commit;
