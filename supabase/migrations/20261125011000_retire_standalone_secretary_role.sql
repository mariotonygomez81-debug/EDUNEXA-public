-- Remove the obsolete standalone Secretary role after all memberships
-- have been migrated to Director with director_subprofile = 'secretaria'.
delete from public.role_permissions
where role_id in (select id from public.roles where key = 'secretary');

delete from public.roles where key = 'secretary';
