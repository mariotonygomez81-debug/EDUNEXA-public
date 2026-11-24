# Inventario y especificación de recuperación del esquema fundacional

- Estado: **bloqueado por falta de fuente DDL autoritativa**
- Fecha de revisión: 2026-11-24
- Rama de trabajo: `feature/tutor-module`
- Alcance: exclusivamente documentación e inventario. Este archivo no es una migración.

## 1. Resultado de la búsqueda de procedencia

Se revisaron las referencias Git visibles, el árbol completo del snapshot y la historia de las rutas de migración:

- El repositorio `mariotonygomez81-debug/EDUNEXA-public` es una edición pública de desarrollo creada el 2026-11-23.
- El commit inmediatamente anterior al snapshot, `381dce457740d95d8e0ec36371c37fadb8f103f9`, contiene únicamente `README.md`.
- El commit `2fe22d9afaf5d6b60327d95c8991ec9a17bdff7a` introduce el snapshot sanitizado y las migraciones disponibles. La primera migración versionada es `20261120024755_academic_core_and_learning_modules.sql`.
- En `feature/tutor-module` hay 156 archivos bajo `supabase/migrations/`; el árbol no contiene un `schema.sql`, `supabase dump`, backup SQL o baseline fundacional identificable.
- La API de GitHub permite revisar refs publicadas, commits alcanzables y árboles versionados; no permite enumerar objetos Git inalcanzables/dangling ni reflogs del servidor. No se ejecutó `git fsck --full --no-reflogs --unreachable` sobre un clon/bare repo del original. Por lo tanto, la ausencia de un objeto SQL no referenciado todavía no puede descartarse.
- Las referencias Git consultadas exponen las ramas `main`, `feature/groq-only-academic-ai`, `feature/ollama-windows-preflight`, `feature/student-module-mobile` y `feature/tutor-module`, además de refs de PR. No se encontraron refs de tags en la respuesta de refs.
- Se localizó el upstream privado original del proyecto. Su README lo identifica como repositorio núcleo privado. Está disponible en esta conexión de GitHub; el nombre y enlace privado se comparten en la conversación y no se publican en este repositorio.
- El repositorio no declara un mirror remoto (`mirror_url = null`). GitHub muestra la URL de clonación del propio repositorio público, pero no conserva el contenido de `.git/config`; por ello no se puede concluir que el repositorio original nunca haya tenido otro remoto.
- La documentación de arquitectura describe repositorios privados por institución, pero no identifica el nombre ni la URL del repositorio fundacional original.
- `supabase/config.toml` conserva el placeholder `project_id = "your-project-ref"`.

**Conclusión de procedencia:** se localizó el upstream privado y se inspeccionaron su rama `main`, su árbol completo, sus migraciones, las ramas históricas relacionadas con gestión institucional y el historial del archivo académico inicial. El upstream contiene 135 migraciones en `main`, pero no contiene un `schema.sql`, dump, backup ni baseline versionado que cree el núcleo institucional faltante. Su auditoría `docs/database/baseline-audit-2026-11-20.md` indica que las primeras migraciones se recuperaron desde `supabase_migrations.schema_migrations.statements`; también deja explícito que la reproducción del esquema completo en una base limpia seguía pendiente. La búsqueda de objetos inalcanzables requiere un clon o bundle original y sigue pendiente. El repositorio original fue localizado, pero no el baseline fundacional completo.

## 2. Inventario de objetos fundacionales faltantes

Los siguientes objetos son referenciados por las migraciones y tipos, pero su definición fundacional no aparece en las migraciones versionadas revisadas. Los campos enumerados son únicamente los expuestos por `src/types/database.types.ts` o por referencias SQL; no constituyen una definición completa.

| Objeto | Evidencia de dependencia | Campos / relaciones observables | Información no recuperada |
|---|---|---|---|
| `public.institutions` | FK de numerosas tablas; scope de permisos y datos institucionales desde la primera migración | `id`, `legal_name`, `display_name`, `slug`, `status`, `locale`, `timezone`, `tax_id`, `created_at`, `updated_at` | DDL completo, restricciones, unicidad de slug, estados válidos, defaults, índices, RLS, políticas, grants, triggers y bootstrap |
| `public.campuses` | FK compuesta desde `divisions`; funciones de administración de sedes | `id`, `institution_id`, `name`, `code`, `address`, `phone`, `is_main`, `created_at` | DDL, FK y unicidades exactas, reglas de sede principal, borrado/archivo, RLS, grants, índices y triggers |
| `public.memberships` | Tabla central para identidad institucional; FK compuestas en múltiples tablas; helper de permisos | `id`, `institution_id`, `user_id`, `status`, `joined_at`, `created_at` | Estados válidos y transiciones, unicidades, FK a Auth, comportamiento al borrar usuarios, RLS, índices, triggers, invitaciones y alta inicial |
| `public.profiles` | El trigger `private.handle_new_user_profile()` inserta `id`, `first_name`, `last_name`, `display_name` | También aparecen en tipos `phone`, `address`, `avatar_path`, `avatar_style`, `professional_titles` y timestamps | DDL, relación exacta con `auth.users`, campos obligatorios, privacidad, RLS, grants, almacenamiento de avatar y triggers |
| `public.roles` | Join de autorización y seed de permisos por `roles.key` | `id`, `key`, `name`, `description`, `is_system`, `created_at` | Catálogo inicial completo, claves válidas, unicidad, alcance de roles, política de modificación y RLS |
| `public.permissions` | Join de autorización; inserciones con conflicto por `key` | `id`, `key`, `description`, `created_at` | Catálogo completo de permisos, unicidad exacta, convenciones de claves, RLS y gobierno de cambios |
| `public.membership_roles` | Une membresías con roles en `private.has_institution_permission` y otras funciones | `membership_id`, `institution_id`, `role_id`, `assigned_at` | PK/UK, FK y acciones, unicidad de asignaciones, vigencia, auditoría, RLS, grants y reglas de delegación |
| `public.role_permissions` | Join entre roles y permisos; seed de asignaciones | `role_id`, `permission_id` | PK/UK, FK y acciones, unicidad, alcance global/local, RLS, grants y proceso de actualización del catálogo |

### Dependencias administradas por Supabase

No deben confundirse con tablas propias faltantes:

- `auth.users` y `auth.uid()` pertenecen al esquema Auth administrado por Supabase.
- Los roles de base de datos `anon`, `authenticated` y `service_role` son parte del entorno Supabase.
- Objetos de Storage y extensiones deben validarse contra una instalación local limpia y las migraciones que los utilizan; no se deben recrear como si fueran tablas de negocio.
- El esquema `private` sí se crea en `20261120030658_create_private_permission_helpers.sql`; no es uno de los objetos fundacionales ausentes.

## 3. Evidencia SQL relevante

1. `20261120024755_academic_core_and_learning_modules.sql` crea las primeras tablas académicas, pero declara FK hacia `institutions`, `campuses` y `memberships`, que presupone existentes. También concede privilegios sobre `profiles`.
2. `20261120030658_create_private_permission_helpers.sql` crea `private.has_institution_permission`, que consulta `memberships`, `membership_roles`, `role_permissions` y `permissions`.
3. `20261120031255_create_profile_on_auth_user.sql` crea una función y un trigger sobre `auth.users`, pero inserta en `public.profiles`; no crea la tabla ni la membresía institucional.
4. `20261120034811_seed_support_ticket_permissions.sql` inserta en `permissions` y `role_permissions`, y presupone que existen `roles` y sus claves iniciales. No crea el catálogo de roles.
5. `20261120035955_enable_scoped_academic_access.sql` utiliza `memberships`, `membership_roles` y `roles` para definir el acceso académico.
6. `20261120224105_secure_education_level_and_campus_management.sql` administra `campuses`, pero no constituye su baseline fundacional.

## 4. Especificación que debe aprobarse antes de escribir el baseline

No se propone DDL en esta etapa. La fuente original o una especificación institucional aprobada debe resolver, como mínimo:

### 4.1 Identidad e institución
- Relación entre `auth.users`, `profiles` y `memberships`.
- Si una cuenta puede tener más de una membresía en la instalación.
- Ciclo de vida de una membresía: invitación, pendiente, activa, suspendida, revocada y baja; confirmar estados reales.
- Procedimiento seguro de creación de la primera institución y su administrador.
- Restricciones de identidad y privacidad del perfil.

### 4.2 Roles y permisos
- Catálogo oficial de roles y claves estables.
- Catálogo oficial de permisos y claves estables.
- Cardinalidad y unicidad de `membership_roles` y `role_permissions`.
- Asignación inicial del rol `institution_admin` y permisos mínimos.
- Quién puede conceder, revocar o delegar roles; auditoría y prevención de escalamiento.

### 4.3 Instituciones y sedes
- Campos obligatorios, identificadores, slug/código y unicidades.
- Estados institucionales permitidos.
- Regla de sede principal y su unicidad por institución.
- Reglas de borrado lógico/físico y conservación histórica.

### 4.4 Seguridad y operación
- RLS y políticas de lectura/escritura para cada tabla fundacional.
- Grants por rol de base de datos; separación de funciones `SECURITY DEFINER` e `INVOKER`.
- Índices para joins y aislamiento por institución.
- FK, acciones `ON DELETE`, constraints, defaults, triggers y auditoría.
- Seeds reproducibles y versionados para roles y permisos.
- Procedimiento de recuperación, backups y compatibilidad de futuras migraciones.

## 5. Criterios de aceptación de la recuperación

El baseline sólo podrá diseñarse cuando se disponga de una de estas fuentes:

1. Repositorio original con historial verificable y migraciones completas.
2. Backup **sólo de esquema**, sin filas ni datos personales, con procedencia, fecha y versión identificables.
3. Especificación DDL aprobada por el responsable del producto, contrastada con el código y la arquitectura vigente.

Antes de habilitar una migración ejecutable se deberá:

- Comparar el baseline con todas las migraciones existentes para evitar duplicar objetos.
- Aplicar el conjunto completo en una instancia Supabase **local** limpia, con CLI y Docker.
- Validar Auth, triggers, FK, RLS, grants, funciones, Storage y extensiones localmente.
- Ejecutar pruebas positivas y negativas con identidades y registros sintéticos exclusivamente locales.
- Verificar que la aplicación y los tipos TypeScript coincidan con el esquema resultante.
- Mantener el SQL como documentación/propuesta hasta completar revisión y aprobación.

## 6. Entorno de pruebas y límites actuales

- Único destino autorizado para pruebas de base de datos: Supabase local gratuito.
- `supabase/config.toml` del snapshot público aún tiene `your-project-ref`; la configuración local no está lista. El upstream privado contiene un `project_id` asociado a la instalación alojada, por lo que no debe copiarse sin cambiarlo en un directorio temporal aislado.
- En el entorno de trabajo de esta sesión no están disponibles Docker ni Supabase CLI, por lo que no se ejecutó el stack local ni pgTAP. Se preparó un procedimiento separado que usa `supabase db start` en un proyecto temporal con identificador local y sin migraciones; no requiere `supabase link` ni autenticación cloud.
- No se consultó ni modificó ningún proyecto Supabase alojado.
- No se generó una migración ejecutable ni se desplegó código.
- Producción y Render permanecen intactos.
- PR #3 permanece abierto y sin fusionar.

## 7. Próxima acción bloqueante

Solicitar al responsable del proyecto una copia de **sólo esquema** del repositorio privado/original o un backup SQL sin datos personales. Si no existe, obtener aprobación explícita de la especificación de los ocho objetos enumerados y de su bootstrap inicial. Hasta entonces, mantener bloqueada la creación de baseline y las migraciones Tutor que dependan de él.


## 8. Fuente upstream localizada y procedimiento local

El repositorio núcleo privado original fue localizado y su historial se inspeccionó en modo lectura. La auditoría de origen confirma que el SQL de las primeras migraciones académicas se recuperó desde el historial de migraciones del proyecto Supabase, no desde un dump del esquema completo. La migración académica inicial crea 29 tablas de módulos y referencia instituciones, campus y membresías preexistentes; la migración de perfil también presupone `public.profiles`. Esto confirma que el baseline de identidad institucional no está contenido en esa secuencia.

La búsqueda no encontró archivos SQL de esquema o backup en el árbol `main`, ni en las ramas relacionadas revisadas. No se consultó la base alojada para obtener un dump. El procedimiento local gratuito queda documentado en `docs/database/supabase-local-foundation-validation.md`; el inventario de catálogo asociado es estrictamente de solo lectura en `docs/database/local-foundation-catalog.readonly.sql`.

### Evidencia adicional del historial original

- El commit raíz alcanzable de `main` en el upstream privado es `31b91034b58e94a0e51ad7d0a9163eb3c6cba39a`, no tiene padres y su árbol contiene únicamente `README.md`. No hay un commit padre en esa historia publicada que contenga un baseline anterior.
- El commit `f3de0c708068ad7d341cd4d6da80446722d74cae` agregó la migración académica histórica `20261120024755_academic_core_and_learning_modules.sql`. Su árbol padre no contenía esa migración; el archivo recuperado crea 29 tablas académicas y referencias a instituciones, campus y membresías preexistentes.
- La auditoría del upstream registra que las primeras tres migraciones se recuperaron desde `supabase_migrations.schema_migrations.statements`; la misma auditoría deja pendiente aplicar el conjunto en una base temporal vacía y compararlo con el catálogo. La auditoría no incluye el DDL completo del baseline.
- Se revisaron las ramas de gestión institucional, fundación de boletines y reconciliación del ledger. Sus árboles mantienen la misma primera secuencia de migraciones y no aportan un archivo baseline/dump adicional.
- No se inspeccionó ni descargó un backup alojado, ni se consultó el catálogo de ningún proyecto Supabase. No se ejecutó Git `fsck` sobre el repositorio remoto; los objetos dangling sólo pueden verificarse con un clon/bundle local del upstream.

### Procedimiento local preparado

- `docs/database/supabase-local-foundation-validation.md`: pasos PowerShell para iniciar únicamente PostgreSQL local en una carpeta temporal aislada, con un `project_id` local y sin migraciones.
- `docs/database/local-foundation-catalog.readonly.sql`: consultas `SELECT` exclusivamente de metadatos del catálogo; no contiene DDL ni DML.
- El procedimiento aún no se ejecutó: esta sesión no dispone de Docker ni Supabase CLI. La primera fase sólo valida infraestructura y metadatos vacíos. La validación real del esquema queda pendiente de una fuente schema-only autorizada.
