-- A published script must always have a publication date, otherwise it drops out
-- of monthly counts ("published in September", pace). When a script becomes
-- published without a date: take the scheduled time from Publications, else today.
create or replace function public.fill_script_pub_date()
returns trigger language plpgsql as $$
declare
  planned timestamptz;
begin
  if new.video_status = 'published' and new.pub_date is null then
    select publish_at into planned
      from public.publications
     where script_id = new.id and publish_at is not null
     order by publish_at desc
     limit 1;
    new.pub_date := coalesce((planned at time zone 'UTC')::date, current_date);
  end if;
  return new;
end $$;

drop trigger if exists trg_fill_script_pub_date on public.scripts;
create trigger trg_fill_script_pub_date
  before insert or update of video_status, pub_date on public.scripts
  for each row execute function public.fill_script_pub_date();
