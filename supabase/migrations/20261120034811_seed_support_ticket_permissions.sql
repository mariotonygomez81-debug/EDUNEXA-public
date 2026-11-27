INSERT INTO public.permissions (key, description)
VALUES
  ('support.create', 'Crear tickets de ayuda y consultar los propios'),
  ('support.read', 'Consultar la bandeja de tickets de la institución'),
  ('support.manage', 'Asignar, priorizar, responder y resolver tickets institucionales'),
  ('support.escalate', 'Escalar tickets institucionales al soporte global PIE')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key = 'support.create'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN ('support.read','support.manage','support.escalate')
WHERE r.key = 'institution_admin'
ON CONFLICT DO NOTHING;
