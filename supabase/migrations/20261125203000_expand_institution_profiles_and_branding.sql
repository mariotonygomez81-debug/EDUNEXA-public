-- Institutional profile expansion. Repository migration only; not applied to hosted Supabase.
alter table public.institutions
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists country text not null default 'Argentina',
  add column if not exists website_url text,
  add column if not exists logo_path text;

alter table public.institutions
  add constraint institutions_contact_email_format check (contact_email is null or contact_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$') not valid,
  add constraint institutions_website_url_format check (website_url is null or website_url ~* '^https?://') not valid;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('institution-logos','institution-logos',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=2097152,
  allowed_mime_types=array['image/png','image/jpeg','image/webp'];

drop function if exists public.platform_list_institutions(integer,timestamptz,text,text);
create function public.platform_list_institutions(p_limit integer default 50,p_before timestamptz default null,p_status text default null,p_search text default null)
returns table(id uuid,display_name text,legal_name text,slug text,status text,locale text,timezone text,tax_id text,
 contact_email text,contact_phone text,address_line text,city text,province text,country text,website_url text,logo_path text,
 created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=''
as $$
begin
 perform private.require_platform_superadmin();
 if p_limit<1 or p_limit>100 then raise exception using errcode='22023',message='invalid_limit'; end if;
 perform private.platform_audit_append('platform.institutions.list','institution_collection',null,null,
 'Consulta administrativa del inventario global','list-'||pg_catalog.gen_random_uuid()::text,'success',
 jsonb_build_object('limit',p_limit,'status',p_status));
 return query select i.id,i.display_name,i.legal_name,i.slug,i.status,i.locale,i.timezone,i.tax_id,
 i.contact_email,i.contact_phone,i.address_line,i.city,i.province,i.country,i.website_url,i.logo_path,i.created_at,i.updated_at
 from public.institutions i where (p_before is null or i.created_at<p_before)
 and (p_status is null or i.status=p_status)
 and (p_search is null or i.display_name ilike '%'||pg_catalog.replace(p_search,'%','')||'%'
 or i.legal_name ilike '%'||pg_catalog.replace(p_search,'%','')||'%' or i.slug ilike '%'||pg_catalog.replace(p_search,'%','')||'%')
 order by i.created_at desc,i.id desc limit p_limit;
end; $$;
revoke all on function public.platform_list_institutions(integer,timestamptz,text,text) from public,anon;
grant execute on function public.platform_list_institutions(integer,timestamptz,text,text) to authenticated;

drop function if exists public.platform_update_institution(uuid,text,text,text,text,timestamptz,text,text,text);
create function public.platform_update_institution(
 p_institution_id uuid,p_display_name text,p_legal_name text,p_locale text,p_timezone text,
 p_tax_id text,p_contact_email text,p_contact_phone text,p_address_line text,p_city text,p_province text,
 p_country text,p_website_url text,p_logo_path text,p_expected_updated_at timestamptz,
 p_reason text,p_request_id text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=private.require_platform_superadmin(); v_claim jsonb; v_before jsonb; v_after jsonb;
 v_updated timestamptz; v_result jsonb;
begin
 if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,'')))<12
 or pg_catalog.length(pg_catalog.btrim(coalesce(p_display_name,''))) not between 2 and 160
 or pg_catalog.length(pg_catalog.btrim(coalesce(p_legal_name,''))) not between 2 and 200
 or p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$'
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone)
 or (p_contact_email is not null and p_contact_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
 or (p_website_url is not null and p_website_url !~* '^https?://')
 or (p_logo_path is not null and p_logo_path !~ ('^'||p_institution_id::text||'/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$')) then
 raise exception using errcode='22023',message='invalid_institution_update'; end if;
 v_claim:=private.platform_idempotency_claim(v_actor,p_idempotency_key,'institution.update',
 jsonb_build_object('id',p_institution_id,'display_name',p_display_name,'legal_name',p_legal_name,'locale',p_locale,
 'timezone',p_timezone,'tax_id',p_tax_id,'contact_email',p_contact_email,'contact_phone',p_contact_phone,
 'address_line',p_address_line,'city',p_city,'province',p_province,'country',p_country,'website_url',p_website_url,
 'logo_path',p_logo_path,'expected',p_expected_updated_at,'reason',p_reason));
 if v_claim->>'claimed'='false' then return v_claim->'result'; end if;
 select to_jsonb(i)-'id'-'created_at'-'updated_at' into v_before from public.institutions i where i.id=p_institution_id for update;
 if not found then raise exception using errcode='P0002',message='institution_not_found'; end if;
 update public.institutions set display_name=pg_catalog.btrim(p_display_name),legal_name=pg_catalog.btrim(p_legal_name),
 locale=p_locale,timezone=p_timezone,tax_id=nullif(pg_catalog.btrim(coalesce(p_tax_id,'')),''),
 contact_email=nullif(pg_catalog.btrim(coalesce(p_contact_email,'')),''),
 contact_phone=nullif(pg_catalog.btrim(coalesce(p_contact_phone,'')),''),
 address_line=nullif(pg_catalog.btrim(coalesce(p_address_line,'')),''),
 city=nullif(pg_catalog.btrim(coalesce(p_city,'')),''),
 province=nullif(pg_catalog.btrim(coalesce(p_province,'')),''),
 country=pg_catalog.btrim(coalesce(p_country,'Argentina')),
 website_url=nullif(pg_catalog.btrim(coalesce(p_website_url,'')),''),
 logo_path=p_logo_path,updated_at=pg_catalog.now()
 where id=p_institution_id and updated_at=p_expected_updated_at returning updated_at into v_updated;
 if v_updated is null then raise exception using errcode='40001',message='institution_version_conflict'; end if;
 select to_jsonb(i)-'id'-'created_at'-'updated_at' into v_after from public.institutions i where i.id=p_institution_id;
 v_result:=jsonb_build_object('id',p_institution_id,'updated_at',v_updated,'fields',v_after);
 perform private.platform_audit_append('platform.institution.update','institution',p_institution_id::text,p_institution_id,
 p_reason,p_request_id,'success',jsonb_build_object('before',v_before,'after',v_after));
 perform private.platform_idempotency_complete(v_actor,p_idempotency_key,v_result);
 return v_result;
end; $$;
revoke all on function public.platform_update_institution(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text,text,text) from public,anon;
grant execute on function public.platform_update_institution(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text,text,text) to authenticated;
