# Investigación de procedencia: esquema fundacional de Supabase

Fecha de revisión: 2026-11-24  
Rama inspeccionada: `feature/tutor-module`  
Commit inspeccionado: `784ba7a976b1c81327cd139c1e216ebebe9efe42`

## Resultado ejecutivo

**No se encontró en el historial Git disponible una definición SQL versionada del esquema fundacional** de `public.institutions`, `public.memberships`, `public.roles`, `public.permissions`, `public.role_permissions`, `public.membership_roles`, `public.profiles` ni `public.campuses`.

No es correcto inventar sus definiciones a partir de los tipos TypeScript ni fabricar una migración inicial aproximada. El esquema actual no es reconstruible de manera fiable desde el conjunto de migraciones versionadas de este repositorio.

No se consultó, exportó ni modificó ningún proyecto Supabase alojado. No se usaron datos institucionales ni de alumnos.

## Evidencia de historial Git

1. El repositorio público se creó con el commit `381dce457740d95d8e0ec36371c37fadb8f103f9`, cuyo árbol contiene únicamente `README.md`.
2. El siguiente commit, `2fe22d9afaf5d6b60327d95c8991ec9a17bdff7a`, se titula `chore: publish sanitized EDUNEXA development snapshot`. En ese snapshot se agregaron las migraciones SQL existentes, pero no una migración de creación de las tablas fundacionales enumeradas arriba.
3. La consulta del historial de Git para `supabase/migrations/20261120024755_academic_core_and_learning_modules.sql` devuelve únicamente ese commit de snapshot como origen del archivo.
4. Se inspeccionaron los árboles de `main`, `feature/groq-only-academic-ai`, `feature/student-module-mobile` y `feature/tutor-module`. Todos derivan del mismo conjunto de migraciones; no apareció una rama alternativa con el baseline fundacional.
5. El archivo `supabase/config.toml` conserva `project_id = "your-project-ref"`; no identifica un proyecto local o una fuente de esquema alternativa.

El nombre “sanitized development snapshot” y la ausencia de commits anteriores con migraciones son compatibles con una publicación parcial del código y no prueban que las tablas faltantes nunca hayan existido en un entorno anterior. Tampoco prueban que el esquema fuera creado manualmente. Su origen exacto sigue sin estar documentado.

## Evidencia en migraciones

### Primera migración SQL

`20261120024755_academic_core_and_learning_modules.sql` comienza creando tablas académicas que dependen de objetos previos:

- `academic_years.institution_id → institutions.id`
- `education_levels.institution_id → institutions.id`
- `courses.institution_id → institutions.id`
- `divisions.institution_id → institutions.id`
- `divisions.campus_id → campuses.id`
- `staff_assignments.membership_id → memberships.id`
- `guardians.membership_id → memberships.id`
- `classroom_members.membership_id → memberships.id`
- `conversation_members.membership_id → memberships.id`
- `messages.sender_membership_id → memberships.id`

La misma migración habilita RLS en las tablas académicas y crea políticas que consultan `public.memberships`. También concede permisos sobre `public.profiles`. Por tanto, no es una migración inicial autónoma.

### Migraciones siguientes

- `20261120030658_create_private_permission_helpers.sql` define `private.has_institution_permission`, que depende de `memberships`, `membership_roles`, `role_permissions` y `permissions`.
- `20261120031255_create_profile_on_auth_user.sql` crea un trigger para insertar el perfil asociado a un usuario Auth; presupone que `public.profiles` existe y está correctamente relacionada con `auth.users`.
- `20261120034811_seed_support_ticket_permissions.sql` inserta permisos y asignaciones a roles existentes; no crea las tablas catálogo.
- `20261120035955_enable_scoped_academic_access.sql` vuelve a depender de `institutions` y `memberships`.
- `20261120224105_secure_education_level_and_campus_management.sql` agrega índices y funciones sobre `campuses`; no es su definición fundacional.

## Lo que aporta database.types.ts y sus límites

`src/types/database.types.ts` contiene formas parciales útiles para orientar una recuperación posterior:

| Tabla | Campos observados en tipos |
|---|---|
| institutions | id, legal_name, display_name, slug, status, locale, timezone, tax_id, created_at, updated_at |
| memberships | id, institution_id, user_id, status, joined_at, created_at |
| roles | id, key, name, description, is_system, created_at |
| permissions | id, key, description, created_at |
| membership_roles | membership_id, institution_id, role_id, assigned_at |
| role_permissions | role_id, permission_id |
| campuses | id, institution_id, name, code, address, phone, is_main, created_at |
| profiles | id, display_name, first_name, last_name, phone, address, avatar_path, avatar_style, professional_titles, timestamps |

Estos tipos **no** son una fuente suficiente para generar DDL. No garantizan constraints, índices únicos, defaults exactos, claves foráneas, reglas de borrado, triggers, políticas RLS, grants, enums, checks ni semántica de estados. No se deben convertir mecánicamente en una migración.

## Grafo de dependencias mínimo conocido

```text
Supabase local Auth (auth.users, auth.uid())
        |
        +---- profiles (id vinculado a auth.users)
        |
        +---- institutions
                  |
                  +---- memberships (user_id -> auth.users,
                  |       institution_id -> institutions)
                  |          |
                  |          +---- membership_roles ---- roles
                  |          |                              |
                  |          |                              +---- role_permissions
                  |          |                                         |
                  |          |                                      permissions
                  |          |
                  |          +---- dependencias de múltiples tablas académicas
                  |
                  +---- campuses
                  |
                  +---- academic_years, education_levels,
                         courses, divisions, subjects, etc.
```

Este diagrama refleja dependencias observadas en las migraciones y tipos; no es una propuesta de DDL ni define el orden exacto de todas las restricciones.

## Origen que debe recuperarse

La fuente válida debe ser una de estas, en este orden:

1. **Repositorio Git privado/original o remoto anterior** del que se obtuvo el snapshot público, incluyendo sus commits históricos y migraciones fundacionales.
2. **Backup de esquema SQL preexistente**, generado previamente y conservado fuera de producción, sin datos, secretos ni registros personales.
3. **Especificación de esquema aprobada y verificable**, reconstruida mediante revisión de código histórico y contratos documentados, con cada constraint, trigger, policy, grant y seed validado antes de implementarlo.

No usar como sustituto:
- una exportación de la base institucional de producción;
- los tipos generados de TypeScript como si fueran DDL;
- datos reales de alumnos, familias o personal;
- el proyecto Supabase ajeno;
- una migración improvisada que simplemente permita que `db reset` avance.

## Estrategia de recuperación y baseline reproducible

### Fase A — Recuperar fuente, sin ejecutar SQL

1. Obtener el remoto/repo privado original o el backup de esquema previamente conservado.
2. Confirmar procedencia, fecha, commit, versión de PostgreSQL y versión de Supabase CLI de origen, si están disponibles.
3. Verificar que el material contiene DDL y políticas, no datos ni secretos.
4. Comparar las definiciones con los contratos observables en migraciones actuales, tipos y llamadas de aplicación.
5. Crear un inventario de objetos: tablas, columnas, tipos, PK/FK, unique/check constraints, índices, triggers, funciones, RLS policies, grants y catálogos/roles/permisos.
6. Identificar seeds mínimos de roles y permisos del sistema y distinguirlos de los datos de una institución concreta.

### Fase B — Diseñar baseline versionado

1. Definir un baseline fundacional con timestamp anterior a `20261120024755`, sólo después de verificar su contenido.
2. Mantener los objetos administrados por Supabase (por ejemplo, `auth.users`) bajo el control de la plataforma local; no crear tablas internas de Auth manualmente.
3. Separar DDL fundacional, funciones/triggers de perfil y seeds de catálogos si el orden de dependencias lo requiere.
4. Preservar exactamente los nombres, constraints, roles, estados y permisos esperados por las migraciones existentes.
5. No editar ni renumerar migraciones históricas sólo para ocultar dependencias rotas.

### Fase C — Validación local gratuita

1. Instalar Docker y Supabase CLI en un equipo local; comprobar versiones.
2. Trabajar en un checkout de `feature/tutor-module`, sin `supabase link`.
3. Ejecutar `supabase start` y confirmar que todos los endpoints apuntan a localhost.
4. Ejecutar `supabase db reset` únicamente contra la base local.
5. Aplicar la suite pgTAP y pruebas de Auth/RLS con usuarios y datos sintéticos.
6. Verificar RPC Tutor, roles, policies, permisos y ocultamiento de notas con `can_view_grades` y `grades.read`.
7. Guardar logs, versión de CLI, resultado y SHA del código como evidencia reproducible.

## Bloqueo y decisión

**Bloqueo actual: falta la fuente autoritativa del esquema fundacional.** No se crea una migración ejecutable hasta recuperarla o aprobar una reconstrucción verificable.

La investigación no autoriza ni requiere:
- acceso al proyecto Supabase principal;
- creación de ramas o proyectos Supabase pagos;
- cambios en Render o despliegues;
- fusión de PR #3;
- pruebas con datos reales.

Cuando aparezca el repositorio original o un backup SQL de esquema sin datos, se podrá comparar y preparar el baseline local con trazabilidad. Hasta entonces, mantener el estado actual y no afirmar que un reset limpio es posible.
