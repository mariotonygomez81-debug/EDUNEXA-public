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
- `PATCH /institutions/:id`, `PATCH /institutions/:id/status`
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


## Segunda etapa: trabajador, contexto delegado y ejecución de planes aprobados

La migración adicional `20261125193000_superadmin_execution_layer.sql` agrega la segunda etapa. Está versionada en GitHub y **no fue aplicada** a Supabase alojado.

### Trabajador de clonación configuration-only

- Endpoint interno: `POST /api/platform/worker/clones`.
- Requiere `Authorization: Bearer <EDUNEXA_PLATFORM_WORKER_SECRET>` y una clave administrativa de Supabase configurada únicamente en el servidor (`SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`).
- La reclamación usa `FOR UPDATE SKIP LOCKED`, lease de 30–600 segundos, contador de intentos y máximo de tres intentos. Un lease agotado se marca fallido y queda auditado.
- Las solicitudes de clonación y de acceso delegado requieren `Idempotency-Key`; los reintentos con la misma clave y el mismo payload devuelven el resultado original, y una clave reutilizada con otro payload se rechaza.
- Cada clonación queda en `pending_approval`; el solicitante no puede aprobarla. Un segundo Superadministrador debe aprobarla antes de que el trabajador pueda reclamar el trabajo.
- La copia está limitada a `private.platform_institution_clone_config` y a las categorías `branding`, `academic_calendar`, `grading_scales`, `timetable_templates`, `notification_templates` y `module_settings`.
- Un validador recursivo rechaza claves o valores que parezcan datos de alumnos, tutores, personas, contactos, credenciales o datos académicos personales. La copia de configuración y el cierre del trabajo ocurren en una transacción SQL.
- **Límite pendiente:** los ajustes institucionales existentes todavía no están sincronizados automáticamente con el registro privado de configuración clonable. El trabajador ya procesa ese registro seguro; falta conectar cada pantalla/API de configuración institucional a su escritura validada. Si no hay categorías registradas, el trabajo termina sin copiar configuración y no copia datos personales.
- El endpoint está implementado, pero no se configuró un cron ni un servicio trabajador en Render. Su ejecución requiere invocación autenticada desde un programador autorizado.

### Contexto de acceso delegado

- El espacio institucional resuelve una delegación vigente tanto por ID como por slug, consultando el claim confiable de `app_metadata` en PostgreSQL.
- Solo el Superadministrador solicitante puede abrir el contexto aprobado por un segundo Superadministrador; se comprueba vencimiento, institución activa y revocación.
- La interfaz presenta un espacio de soporte de solo lectura, sin crear membresías, suplantar usuarios ni exponer datos de alumnos, tutores o expedientes.
- **Límite de seguridad deliberado:** esta etapa integra el contexto en la entrada del espacio institucional, pero no concede acceso delegado a los datos ni a las operaciones de los siete módulos. Los endpoints y políticas RLS de cada módulo siguen aplicando sus permisos normales. No se usa una clave de servicio para eludir esas políticas.

### Adaptadores de planes Groq

- Endpoint: `POST /api/platform/copilot/plans/:id/execute`.
- La base de datos reclama el plan una sola vez y exige que ejecute el Superadministrador que lo aprobó, distinto del solicitante. La aprobación independiente funciona como segunda autorización para todas las acciones.
- GitHub queda fijado al repositorio EDUNEXA. Permite inspección, dispatch del workflow CI en `feature/EDUNEXA-MODELES` y creación de PR en borrador únicamente desde ramas `feature/EDUNEXA-*` hacia `feature/EDUNEXA-MODELES`; no puede apuntar a `main`. Si falla la finalización de auditoría, intenta cerrar los PR en borrador creados.
- Supabase utiliza exclusivamente el endpoint Management API `database/query/read-only` con consultas SQL fijas de catálogo para inspeccionar esquema/RLS. No aplica migraciones ni ejecuta SQL arbitrario.
- Render inspecciona servicios permitidos por `EDUNEXA_RENDER_SERVICE_IDS`, consulta logs y genera un plan de despliegue; no inicia ni modifica despliegues.
- Variables opcionales/de servidor: `GITHUB_TOKEN`, `EDUNEXA_CI_WORKFLOW_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `RENDER_API_KEY`, `RENDER_OWNER_ID`, `EDUNEXA_RENDER_SERVICE_IDS`. Ninguna se configura ni se modifica desde este cambio.
- Las acciones externas se ejecutan en una saga: claim y auditoría inicial en PostgreSQL, operación externa, cierre auditado y compensación de PR cuando corresponde. Un plan que incluya una operación no habilitada se rechaza completo.

### Validación y límites operativos

- La suite sintética ahora aplica ambas migraciones a PostgreSQL efímero y prueba idempotencia de clonación, reclamación de trabajo, copia de configuración permitida, no copia de membresías, contexto delegado, ejecución por el segundo aprobador y bloqueo de reejecución.
- Los adaptadores de Supabase y Render son de solo lectura. No se aplicaron migraciones alojadas, no se cambió ningún servicio de Render, no se añadieron secretos y no se desplegó el worker.
- El runtime de esta sesión no tiene Supabase CLI instalado; por eso la nueva migración se añadió directamente al repositorio siguiendo el formato de migraciones y queda pendiente de validación con CLI/local Supabase antes de cualquier aplicación.
- El acceso delegado a los módulos y la sincronización de configuración real para clonación continúan siendo tareas separadas antes de considerar esta función productiva.


## Alcance delegado por módulo y sincronización de configuración

- Cada delegación nueva requiere una lista explícita de módulos (docentes, preceptor, alumnos, tutor, directivos, administrativos, administrador), motivo y vencimiento máximo de 30 minutos. Las delegaciones antiguas sin alcance explícito se revocan durante la migración.
- El RPC platform_read_delegated_module valida en cada consulta la identidad global confiable, la solicitud del actor, la segunda aprobación, el vencimiento, el estado activo de la institución y el módulo permitido. Devuelve únicamente instantáneas de configuración no personal; no otorga SELECT sobre tablas de alumnos, tutores, notas, asistencia, mensajes ni membresías. Cada lectura genera auditoría.
- Los cambios en ciclos lectivos, períodos, escalas y estructura académica sincronizan instantáneas no personales en private.platform_institution_clone_config. La clonación configuration-only copia las categorías permitidas y materializa en la institución destino escalas, niveles, cursos, materias, relaciones curso-materia, ciclos, períodos y divisiones, remapeando sus identificadores. No copia sedes/direcciones, membresías, personal, matrículas, alumnos, tutores, notas, asistencias, mensajes ni expedientes. La materialización ocurre en la misma transacción que marca el trabajo completado; ante error se revierte y el trabajo se reencola para recuperación.
- La consola Superadministrador incorpora formularios de solicitud, aprobaciones independientes, ejecución de un trabajo de clonación ya aprobado y cola de planes Groq con aprobación/ejecución. Los secretos administrativos se leen únicamente en rutas del servidor.
- Supabase alojado y Render siguen en lectura/planificación: esta migración no se aplica a servicios alojados ni autoriza despliegues o cambios de esquema remotos.
