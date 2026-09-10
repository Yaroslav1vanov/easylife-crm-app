-- When a publication becomes "published", close its script in Montage automatically.
-- Catches every path: status check, cron, manual drag to "Published", API.
create or replace function public.sync_script_on_publish()
returns trigger language plpgsql as $$
begin
  if new.pub_status = 'published'
     and (old.pub_status is distinct from 'published')
     and new.script_id is not null then
    update public.scripts
       set video_status = 'published',
           pub_date     = coalesce(pub_date, (new.publish_at at time zone 'UTC')::date),
           updated_at   = now()
     where id = new.script_id
       and video_status is distinct from 'published';
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_script_on_publish on public.publications;
create trigger trg_sync_script_on_publish
  after update of pub_status on public.publications
  for each row execute function public.sync_script_on_publish();
