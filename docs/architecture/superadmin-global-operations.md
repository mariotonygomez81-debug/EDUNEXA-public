# Operaciones globales del Superadministrador EDUNEXA

## Estado de implementación

Se incorporó en `feature/EDUNEXA-MODELES` un primer backend de control global con contratos SQL, rutas de servidor, aprobación de dos personas para cambios de privilegio, bitácora append-only y generación de planes mediante Groq.

**El SQL es una migración versionada en el repositorio y no fue aplicado al proyecto Supabase alojado.** No se modificaron el proyecto Supabase ni los servicios o secretos de Render. La ejecución del flujo Auth de Superadministradores requiere `SUPABASE_SECRET_KEY` (o `SUPABASE_SERVICE_ROLE_KEY`) configurada exclusivamente en el servidor. No se habilita desde el navegador.

## Límites de autoridad

- Superadministrador: autorización global independiente de membresías institucionales. El backend valida la señal confiable actual `auth.users.raw_app_meta_data.platform_role = "superadmin"`; nunca usa `user_metadata`.
- Administrador institucional: autoridad limitada a una membresía activa de un colegio y a los permisos de esa membresía. No puede listar ni modificar otras instituciones ni elevarse a Superadministrador.
- Las rutas de plataforma autentican con `auth.getUser()`, verifican el claim de aplicación y exigen origen same-origin en operaciones de escritura.
- Las funciones privilegiadas se ejecutan en PostgreSQL con `SECURITY DEFINER`, `search_path = ''` y validación independiente del actor. Los clientes autenticados no tienen acceso directo a las tablas privadas.

## Operaciones incorporadas en el contrato del backend

1. **Instituciones:** inventario global paginado, creación en estado `pending`, activación/suspensión con transición permitida y control optimista por `updated_at`.
2. **Administradores institucionales:** asignación de un usuario Auth existente a la membresía de un colegio con rol `institution_admin`; revocación con motivo, bloqueo de autorrevocación y protección del último administrador.
3. **Superadministradores:** solicitud de alta/revocación del claim `app_metadata.platform_role`, aprobación por una segunda persona y ejecución servidor-servidor mediante Supabase Auth Admin. Se registra intención, inicio y resultado; se intenta reversión si falla la finalización de auditoría.
4. **Acceso delegado:** solicitud limitada a una institución, motivo obligatorio, expiración máxima de 30 minutos y aprobación de otro Superadministrador. Es un permiso temporal de soporte, no una suplantación de identidad ni una sesión de administrador institucional; todavía no se conecta a las acciones de los módulos.
5. **Clonación:** crea una institución destino en estado `pending` y un trabajo en cola con modo `configuration_only`. No copia alumnos, tutores, legajos, calificaciones, asistencia, mensajes ni otros datos personales. El trabajador que copie la configuración aún no está desplegado; la operación permanece en cola.
6. **Auditoría:** eventos append-only, sin UPDATE/DELETE para roles de aplicación, con actor, acción, objetivo, institución, motivo, request ID, resultado y metadatos reducidos. Lecturas de inventario y auditoría también generan trazabilidad.
7. **Copiloto EDUNEXA:** genera planes estructurados exclusivamente con Groq. Se filtran instrucciones que contienen patrones de secretos o datos personales, se valida una lista permitida de acciones y se requiere aprobación independiente. La aprobación deja el plan en modo `review_only`; no ejecuta automáticamente cambios en GitHub, Supabase ni Render.

## Rutas de servidor

Base: `/api/platform`.

- `GET /institutions`, `POST /institutions`
- `PATCH /institutions/:id/status`
- `POST /institutions/:id/administrators`, `DELETE /institutions/:id/administrators/:membershipId`
- `POST /delegations`, `POST /delegations/:id/approve`, `POST /delegations/:id/revoke`
- `POST /clones`
- `GET /superadmins`, `GET /institutions/:id/administrators`\n- `POST /superadmins/requests`, `POST /superadmins/requests/:id/approve`, `POST /superadmins/requests/:id/execute`
- `GET /audit`
- `POST /copilot/plans`, `POST /copilot/plans/:id/approve`

Las escrituras requieren `Origin` same-origin. Las operaciones idempotentes de instituciones y membresías requieren `Idempotency-Key`. Los motivos administrativos deben tener al menos 12 caracteres.

## Controles de auditoría y transacciones

- El cambio de institución, estado y membresías, así como su evento de auditoría, ocurre dentro de la misma transacción SQL.
- El registro de auditoría es append-only mediante trigger y permisos; el esquema privado no se expone al cliente.
- Los cambios de Superadministrador usan un flujo tipo saga porque Supabase Auth Admin es una API externa: se registra la solicitud, se aprueba por un segundo actor, se registra el inicio, se modifica Auth y se registra el resultado. Si falla el cierre de auditoría se intenta restaurar el `app_metadata` anterior.
- La revocación del último administrador institucional y del último Superadministrador se bloquea. Los cambios globales se serializan con advisory lock.
- Las consultas no devuelven secretos ni información académica de alumnos.

## Pruebas añadidas

- Verificación estática de autorización, allowlist Groq, rutas y controles de auditoría.
- Suite PostgreSQL aislada en CI que crea identidades e instituciones sintéticas y prueba: denegación sin claim, rechazo de `user_metadata`, idempotencia, transiciones, último administrador, aprobación independiente, expiración de delegación, clonación sin datos personales, flujo de privilegio y append-only.
- La suite se ejecuta contra un PostgreSQL efímero de GitHub Actions; no se conecta a Supabase ni a Render.

## Funciones deliberadamente no habilitadas

- La delegación aún no modifica el contexto operativo de las rutas de los siete módulos institucionales. No es impersonación.
- La clonación solo crea el trabajo aislado en cola; falta el worker que replique una lista blanca de configuración.
- La invitación por correo de administradores nuevos no está incluida; la asignación requiere un usuario ya existente en Auth.
- El Copiloto no aplica migraciones, no cambia repositorios, no despliega servicios y no ejecuta comandos externos. La aprobación actual registra el plan, pero la ejecución de conectores GitHub/Supabase/Render permanece bloqueada hasta implementar y validar cada adaptador, límites de alcance, rollback y auditoría de resultado.
- La migración no fue aplicada y no se ha probado todavía contra el esquema real alojado. No afirmar disponibilidad productiva hasta completar CI, revisión SQL y despliegue autorizado.

## Criterio para habilitación productiva

Cada función se habilitará por separado después de que la migración supere CI y revisión, se valide contra una copia aislada del esquema real, se pruebe rollback, se complete la integración del trabajador de clonación y del acceso delegado, y se configure el secreto de Auth Admin de forma segura. Las operaciones de GitHub, Supabase y Render requerirán conectores con acciones allowlisted y aprobación explícita antes de cada ejecución.
