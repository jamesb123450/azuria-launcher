begin;
-- Recent conversation metadata only; encrypted content never appears in this index.
create function public.message_conversations()
returns table(account_id uuid, latest_at timestamptz, unread bigint)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  return query
    select peer.id, recent.created_at,
      (select count(*) from public.direct_messages incoming
        where incoming.recipient_id=actor and incoming.sender_id=peer.id and incoming.read_at is null)
    from public.friendships f
    cross join lateral (select case when f.user_low=actor then f.user_high else f.user_low end as id) peer
    cross join lateral (
      select m.id,m.created_at from public.direct_messages m
      where least(m.sender_id,m.recipient_id)=least(actor,peer.id)
        and greatest(m.sender_id,m.recipient_id)=greatest(actor,peer.id)
      order by m.id desc limit 1
    ) recent
    where actor in (f.user_low,f.user_high) and not azuria_private.pair_blocked(actor,peer.id)
    order by recent.id desc limit 200;
end;
$$;
revoke all on function public.message_conversations() from public,anon,authenticated;
grant execute on function public.message_conversations() to authenticated;
notify pgrst,'reload schema';
commit;
