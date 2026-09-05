-- FreeCell: gedeelde ranglijst per club.
--
-- Opzet: de tabellen zijn voor niemand rechtstreeks bereikbaar (RLS aan,
-- geen policies, alle rechten ingetrokken). Alles loopt via functies die
-- de clubcode als sleutel gebruiken. Wie de code niet heeft, kan niets:
-- niet lezen, niet schrijven. Dat is precies zo bedoeld -- de site is
-- openbaar, de ranglijst is dat niet.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tabellen
create table if not exists public.clubs (
  code       text primary key,
  naam       text not null,
  gemaakt_op timestamptz not null default now()
);

create table if not exists public.scores (
  id         uuid primary key default gen_random_uuid(),
  club       text not null references public.clubs(code) on delete cascade,
  speler_id  text not null,
  naam       text not null,
  tekst      text not null default '',
  tijd_ms    integer not null,
  zetten     integer not null,
  score      integer not null,
  spel       integer not null,
  niveau     text not null,
  trede      integer not null default 1,
  cellen     integer not null default 4,
  hints      integer not null default 0,
  undos      integer not null default 0,
  dagpuzzel  boolean not null default false,
  gemaakt_op timestamptz not null default now()
);
create index if not exists scores_club_tijd  on public.scores (club, tijd_ms);
create index if not exists scores_club_datum on public.scores (club, gemaakt_op desc);

-- wie er nu speelt: een regel per speler, ververst met een hartslag
create table if not exists public.aanwezig (
  club      text not null references public.clubs(code) on delete cascade,
  speler_id text not null,
  naam      text not null,
  bezig     boolean not null default false,
  spel      integer,
  gezien    timestamptz not null default now(),
  primary key (club, speler_id)
);

alter table public.clubs    enable row level security;
alter table public.scores   enable row level security;
alter table public.aanwezig enable row level security;

revoke all on public.clubs    from anon, authenticated;
revoke all on public.scores   from anon, authenticated;
revoke all on public.aanwezig from anon, authenticated;

-- ---------------------------------------------------------------- functies
-- Codes: 6 tekens zonder O/0/I/1, zodat voorlezen door de telefoon goed gaat.
create or replace function public.nieuwe_code() returns text
language plpgsql as $$
declare
  tekens text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;   -- niet "code": dat botst met de kolomnaam clubs.code
  i      integer;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(tekens, 1 + floor(random() * length(tekens))::int, 1);
    end loop;
    exit when not exists (select 1 from public.clubs c where c.code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.club_maak(p_naam text)
returns table (uit_code text, uit_naam text)
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_naam text := coalesce(nullif(btrim(p_naam), ''), 'Onze club');
begin
  if length(v_naam) > 30 then v_naam := substr(v_naam, 1, 30); end if;
  v_code := public.nieuwe_code();
  insert into public.clubs (code, naam) values (v_code, v_naam);
  return query select v_code, v_naam;
end;
$$;

create or replace function public.club_zoek(p_code text)
returns table (uit_code text, uit_naam text, leden bigint)
language sql security definer set search_path = public as $$
  select c.code, c.naam,
         (select count(distinct s.speler_id) from public.scores s where s.club = c.code)
    from public.clubs c
   where c.code = upper(btrim(p_code));
$$;

create or replace function public.score_stuur(
  p_code text, p_speler_id text, p_naam text, p_tekst text,
  p_tijd_ms integer, p_zetten integer, p_score integer, p_spel integer,
  p_niveau text, p_trede integer, p_cellen integer,
  p_hints integer, p_undos integer, p_dagpuzzel boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(btrim(p_code));
begin
  if not exists (select 1 from public.clubs c where c.code = v_code) then
    raise exception 'club bestaat niet';
  end if;
  -- botte grenzen tegen onzin: een potje duurt minstens 20 seconden en
  -- kost minstens 52 zetten (elke kaart moet immers ergens heen).
  if p_tijd_ms < 20000 or p_tijd_ms > 86400000 then raise exception 'tijd klopt niet'; end if;
  if p_zetten < 52 or p_zetten > 100000 then raise exception 'zetten kloppen niet'; end if;
  if p_score < 0 or p_score > 100000 then raise exception 'score klopt niet'; end if;
  if (select count(*) from public.scores s
       where s.club = v_code and s.speler_id = p_speler_id
         and s.gemaakt_op > now() - interval '1 day') > 200 then
    raise exception 'te veel inzendingen vandaag';
  end if;

  insert into public.scores (club, speler_id, naam, tekst, tijd_ms, zetten, score, spel,
                             niveau, trede, cellen, hints, undos, dagpuzzel)
  values (v_code, p_speler_id, substr(coalesce(p_naam, 'Speler'), 1, 14),
          substr(coalesce(p_tekst, ''), 1, 34),
          p_tijd_ms, p_zetten, p_score, p_spel,
          substr(coalesce(p_niveau, 'beginner'), 1, 12), coalesce(p_trede, 1),
          coalesce(p_cellen, 4), coalesce(p_hints, 0), coalesce(p_undos, 0),
          coalesce(p_dagpuzzel, false));
end;
$$;

-- p_sortering: 'tijd' | 'zetten' | 'score'
create or replace function public.scores_top(
  p_code text, p_sortering text default 'tijd', p_niveau text default null,
  p_spel integer default null, p_limiet integer default 50)
returns table (naam text, tekst text, tijd_ms integer, zetten integer, score integer,
               spel integer, niveau text, trede integer, speler_id text, gemaakt_op timestamptz)
language sql security definer set search_path = public as $$
  select s.naam, s.tekst, s.tijd_ms, s.zetten, s.score, s.spel, s.niveau, s.trede,
         s.speler_id, s.gemaakt_op
    from public.scores s
   where s.club = upper(btrim(p_code))
     and (p_niveau is null or s.niveau = p_niveau)
     and (p_spel is null or s.spel = p_spel)
   order by
     case when p_sortering = 'zetten' then s.zetten end asc,
     case when p_sortering = 'score'  then -s.score  end asc,
     case when p_sortering not in ('zetten','score') then s.tijd_ms end asc,
     s.tijd_ms asc
   limit least(coalesce(p_limiet, 50), 200);
$$;

create or replace function public.aanwezig_ping(
  p_code text, p_speler_id text, p_naam text,
  p_bezig boolean default false, p_spel integer default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(btrim(p_code));
begin
  if not exists (select 1 from public.clubs c where c.code = v_code) then return; end if;
  insert into public.aanwezig (club, speler_id, naam, bezig, spel, gezien)
  values (v_code, p_speler_id, substr(coalesce(p_naam,'Speler'),1,14),
          coalesce(p_bezig,false), p_spel, now())
  on conflict (club, speler_id) do update
    set naam = excluded.naam, bezig = excluded.bezig, spel = excluded.spel, gezien = now();
  -- oude regels opruimen, zodat de tabel klein blijft
  delete from public.aanwezig a where a.gezien < now() - interval '1 day';
end;
$$;

create or replace function public.aanwezig_nu(p_code text)
returns table (naam text, bezig boolean, spel integer, speler_id text)
language sql security definer set search_path = public as $$
  select a.naam, a.bezig, a.spel, a.speler_id
    from public.aanwezig a
   where a.club = upper(btrim(p_code))
     and a.gezien > now() - interval '90 seconds'
   order by a.bezig desc, a.naam;
$$;

grant execute on function public.club_maak(text)                     to anon, authenticated;
grant execute on function public.club_zoek(text)                     to anon, authenticated;
grant execute on function public.score_stuur(text,text,text,text,integer,integer,integer,integer,text,integer,integer,integer,integer,boolean) to anon, authenticated;
grant execute on function public.scores_top(text,text,text,integer,integer) to anon, authenticated;
grant execute on function public.aanwezig_ping(text,text,text,boolean,integer) to anon, authenticated;
grant execute on function public.aanwezig_nu(text)                   to anon, authenticated;
revoke execute on function public.nieuwe_code() from anon, authenticated;
