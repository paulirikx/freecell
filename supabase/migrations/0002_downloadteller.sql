-- Downloadteller: hoeveel verschillende apparaten hebben de app opgehaald.
-- We bewaren alleen een willekeurig nummer dat de browser zelf verzint; geen
-- IP-adres, geen naam, niets waaraan iemand te herkennen is.

create table if not exists public.downloads (
  apparaat_id text primary key,
  gemaakt_op  timestamptz not null default now()
);

alter table public.downloads enable row level security;
revoke all on public.downloads from anon, authenticated;

create or replace function public.download_tel(p_id text)
returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or length(p_id) < 6 or length(p_id) > 64 then
    return (select count(*) from public.downloads);
  end if;
  insert into public.downloads (apparaat_id) values (p_id)
  on conflict (apparaat_id) do nothing;
  return (select count(*) from public.downloads);
end;
$$;

create or replace function public.download_aantal()
returns bigint
language sql security definer set search_path = public as $$
  select count(*) from public.downloads;
$$;

grant execute on function public.download_tel(text) to anon, authenticated;
grant execute on function public.download_aantal() to anon, authenticated;
