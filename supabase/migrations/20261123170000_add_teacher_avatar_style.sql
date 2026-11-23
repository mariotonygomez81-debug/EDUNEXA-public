-- Store each teacher's preferred illustrated avatar for cases without a profile photo.
alter table public.profiles
  add column if not exists avatar_style text not null default 'neutral';

alter table public.profiles
  drop constraint if exists profiles_avatar_style_check;

alter table public.profiles
  add constraint profiles_avatar_style_check
  check (avatar_style in ('neutral', 'masculino', 'femenino'));
