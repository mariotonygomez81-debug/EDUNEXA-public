# EDUNEXA — Integración de la plataforma única

- Estado: **plan de ejecución y criterios de aceptación**
- Rama de trabajo: `feature/tutor-module`
- Repositorio: `mariotonygomez81-debug/EDUNEXA-public`
- Alcance: desarrollo sobre la aplicación central; no autoriza despliegues ni cambios en servicios o bases alojadas.

## 1. Decisión de arquitectura

EDUNEXA se desarrolla como una única aplicación integral. Los módulos no son productos independientes ni implementaciones temporales que deban reescribirse al pasar a producción.

La implementación de cada módulo debe usar desde el primer día:
- los mismos modelos y contratos de datos definitivos;
- persistencia PostgreSQL/Supabase;
- autenticación Supabase Auth y sesión compartida;
- autorización por institución, membresía, rol y permiso;
- validación en servidor y restricciones en base de datos;
- navegación y componentes compartidos;
- auditoría y trazabilidad de operaciones sensibles.

Los registros ficticios sólo se permiten como datos de prueba sembrados en entornos aislados. No se admiten arreglos locales, estados en memoria ni formularios que simulen altas como sustituto del flujo de producción.

## 2. Arquitectura central observada en el repositorio

- La raíz `/` redirige a `/login`.
- `/login`, `/forgot-password` y `/reset-password` forman el acceso común.
- Los clientes Supabase de servidor y navegador están centralizados en `src/lib/supabase/`.
- `/dashboard` verifica la sesión y la membresía institucional.
- Los módulos institucionales viven bajo `/dashboard/[slug]/...`.
- `src/lib/auth/permissions.ts` obtiene permisos de los roles de la membresía. La base de datos/RLS debe seguir siendo la autoridad final.
- Hay módulos conectados a tablas y RPC de Supabase: alumnos, estructura académica, asistencia, calificaciones, boletines, aula virtual, comunicaciones, mensajes, notificaciones, citaciones, administración y portal familiar.
- El portal familiar ya dispone de una ruta central `/dashboard/[slug]/portal` y consulta `list_my_portal_students`, además de flujos relacionados con asistencia, tareas, boletines, mensajes, notificaciones y citaciones.
- Existen rutas de demostración del tutor bajo `/demo/...`; son aisladas y no deben ser el destino final ni publicarse como producto paralelo.

## 3. Bloqueo de base de datos identificado

El repositorio contiene migraciones de módulos y tipos TypeScript, pero la auditoría `docs/database/supabase-foundation-inventory.md` identifica que el baseline fundacional no está completo en la secuencia versionada. Entre las dependencias que las migraciones dan por existentes están:

- `public.institutions`
- `public.campuses`
- `public.memberships`
- `public.profiles`
- `public.roles`
- `public.permissions`
- `public.membership_roles`
- `public.role_permissions`

La primera migración académica crea tablas académicas que ya referencian instituciones, sedes y membresías. La migración de perfil también presupone `public.profiles`. `supabase/config.toml` conserva el placeholder `your-project-ref`.

**Regla:** no inventar el DDL de estas entidades, no ejecutar migraciones contra Supabase alojado y no cambiar proyectos hosted. Primero recuperar una fuente schema-only verificable o aprobar una especificación completa; luego validar todo en Supabase local limpio.

## 4. Modelo de integración funcional

### Identidad y acceso
- Una cuenta autenticada mantiene una sesión única en todo el sitio.
- Una persona puede tener una o más membresías según la política institucional aprobada; el contexto activo se resuelve de forma explícita.
- Los roles se asignan a membresías, no se aceptan desde metadatos editables del usuario.
- Cada operación verifica membresía activa, rol, permiso y alcance institucional en servidor y RLS.
- El cambio de módulo no solicita un nuevo login.

### Datos y relaciones
- PostgreSQL es el origen de verdad.
- Las entidades académicas se relacionan por identificadores y claves foráneas, siempre incluyendo el alcance de institución donde corresponda.
- Los módulos consumen servicios/RPC tipados y reutilizables; no duplican datos maestros.
- Matrícula es la fuente de verdad para nivel, curso, división y ciclo lectivo.
- Tutoría se relaciona con estudiantes matriculados mediante una relación institucional autorizada. No se crea una segunda ficha académica al vincular un hijo.
- Las notificaciones, mensajes, tareas, asistencia y boletines referencian los mismos registros y relaciones de origen.

### Pantallas y navegación
- Un solo sitio, layout, navegación y sistema visual.
- Las pantallas de login y recuperación son centrales.
- Las rutas de cada módulo están dentro del espacio institucional autenticado.
- La visibilidad de una opción en el menú es una ayuda de UX; no reemplaza los controles de autorización del servidor y la base de datos.

## 5. Secuencia de ejecución

### Fase 1 — Fundamento reproducible (bloqueante)
1. Recuperar/verificar el DDL schema-only de las ocho entidades fundacionales y sus dependencias.
2. Configurar Supabase local con un project_id local, sin `supabase link`.
3. Aplicar todas las migraciones en una base local limpia.
4. Corregir el orden y las dependencias hasta que la reconstrucción sea reproducible.
5. Comparar el esquema resultante con `src/types/database.types.ts`.
6. Ejecutar pruebas de autenticación, RLS, roles y aislamiento multiinstitución con identidades ficticias locales.

Criterio de salida: una base vacía puede reconstruirse íntegramente con migraciones versionadas y todas las políticas críticas pasan pruebas positivas y negativas.

### Fase 2 — Núcleo de identidad institucional
1. Completar altas/invitaciones y ciclo de vida de cuentas y membresías.
2. Asegurar catálogo de roles/permisos y asignaciones iniciales.
3. Centralizar la resolución de contexto institucional y autorización.
4. Verificar perfil de usuario y perfiles por rol sin duplicar identidad.

### Fase 3 — Integración funcional de módulos
1. Publicar todos los módulos bajo el mismo Next.js y el mismo dominio.
2. Conectar cada pantalla a servicios persistentes y contratos tipados.
3. Eliminar flujos que dependan de fixtures locales como comportamiento de aplicación.
4. Unificar perfiles y navegación para administración, directivos, docentes, preceptores, estudiantes y tutores.
5. Completar relaciones entre matrícula, docentes, familias, aulas, tareas, evaluaciones, boletines, asistencia, mensajes y notificaciones.

### Fase 4 — Portal del tutor definitivo
1. Reutilizar el portal familiar central existente; no mantener una app de tutor separada.
2. Permitir editar el perfil de la cuenta autenticada con controles de privacidad.
3. Permitir vincular uno o más estudiantes ya matriculados.
4. El formulario solicita sólo los datos de identidad definidos por la institución; nivel, año, división y ciclo se leen de la matrícula.
5. La coincidencia de identidad no concede acceso automáticamente: una validación del lado servidor verifica la autorización institucional y registra la relación.
6. Aplicar protección contra enumeración de alumnos, fuerza bruta, abuso, exposición de documentos y registros de datos sensibles.
7. Reflejar inmediatamente los vínculos autorizados en tareas, asistencia, boletines, citaciones, mensajes y notificaciones.

### Fase 5 — Calidad y publicación única
- Pruebas unitarias, integración, E2E y pruebas de permisos por rol.
- Pruebas de aislamiento entre instituciones y acceso denegado a estudiantes no vinculados.
- Validación de migraciones y RLS sobre base local limpia.
- Build, smoke tests y revisión de rutas públicas.
- Publicación final desde el servicio único autorizado, sólo después de autorización explícita para despliegue.

## 6. Reglas de datos y privacidad

- Los datos sintéticos tienen la misma forma, constraints y relaciones que los datos operativos; se cargan mediante seeds de prueba reproducibles.
- Nunca se usa información real de menores en desarrollo, CI o demos.
- DNI, fecha de nacimiento y demás identificadores no se incluyen en logs, mensajes de error, URLs ni telemetría.
- La búsqueda por identidad se ejecuta en servidor mediante una operación acotada, con autorización, limitación de intentos y respuesta que no permita enumerar alumnos.
- No se habilita acceso académico por una coincidencia de DNI/fecha solamente.
- RLS debe proteger cada tabla expuesta; los permisos de UI no sustituyen RLS.
- Nunca exponer claves secretas o service_role al navegador.
- Backups, restauración y auditoría forman parte de los criterios de producción.

## 7. Límites operativos de esta etapa

- Sólo se trabaja en `mariotonygomez81-debug/EDUNEXA-public`, rama `feature/tutor-module`.
- No usar el repositorio privado ni la rama `feature/student-module-mobile`.
- No modificar ni fusionar PR #3.
- No modificar producción, Supabase hosted ni Render; no desplegar.
- No ejecutar SQL de escritura en proyectos alojados.
- No crear servicios, cuentas, contratos ni costos.
- El proveedor de IA autorizado sigue siendo exclusivamente Groq; no incorporar IA local.

## 8. Criterio final de aceptación

EDUNEXA estará integrada cuando una persona inicie sesión una sola vez en el sitio central, vea los módulos autorizados por su membresía y utilice flujos persistentes que lean y escriban entidades compartidas, con aislamiento institucional y permisos aplicados en servidor y base de datos. Ningún módulo se considerará integrado sólo por tener una pantalla o aparecer en el menú.
