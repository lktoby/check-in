create index if not exists check_ins_line_user_created_at_idx
  on public.check_ins (line_user_id, created_at desc);

create or replace function public.enforce_check_in_24_hour_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Serialize check-ins for the same LINE user so simultaneous requests cannot
  -- both pass the 24-hour lookback check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.line_user_id, 0)
  );

  if exists (
    select 1
    from public.check_ins as existing
    where existing.line_user_id = new.line_user_id
      and existing.created_at > pg_catalog.clock_timestamp() - interval '24 hours'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'You can check in only once every 24 hours.';
  end if;

  return new;
end;
$$;

create trigger check_ins_enforce_24_hour_limit
before insert on public.check_ins
for each row
execute function public.enforce_check_in_24_hour_limit();
