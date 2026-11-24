# EDUNEXA — Integración de la plataforma única

- Estado: **plan de ejecución y criterios de aceptación**
- Rama de trabajo: `feature/tutor-module`
- Repositorio: `mariotonygomez81-debug/EDUNEXA-public`
- Alcance actual: una instalación para un solo colegio, una aplicación web y una base Supabase.
- Este documento no autoriza despliegues ni cambios en servicios o bases alojadas.

## 1. Decisión de arquitectura vigente

EDUNEXA se construye ahora para **un único colegio**. En esta etapa no se implementan multitenancy, selector de instituciones, superadministración global ni provisión automatizada de colegios.

La instalación actual utiliza:
- un repositorio GitHub;
- una base de datos Supabase;
- un espacio/servicio Render;
- un único sitio web con todos los módulos integrados;
- autenticación central y pantallas comunes de inicio y recuperación de sesión;
- usuarios, roles y permisos del colegio;
- datos institucionales compartidos, coherentes y persistentes.

La aplicación debe ser portable para que, en una etapa futura y sólo cuando se indique expresamente, cada colegio pueda tener una instalación independiente (repositorio, Supabase y Render). Esa expansión queda fuera del alcance actual.

## 2. Criterios técnicos no negociables

Cada módulo debe usar desde el primer día:
- los modelos y contratos de datos definitivos;
- persistencia PostgreSQL/Supabase, sin reemplazar operaciones reales por estado local o fixtures;
- autenticación Supabase Auth y sesión compartida;
- autorización por membresía, rol y permiso;
- validación del lado servidor y políticas RLS;
- navegación, componentes y servicios compartidos;
- auditoría para operaciones sensibles.

Los datos de prueba pueden ser ficticios, pero deben respetar la misma estructura, relaciones, constraints, validaciones y reglas de seguridad que los datos operativos. Nunca usar datos reales de menores en desarrollo o CI.

## 3. Arquitectura central observada

- `/` redirige a `/login`.
- `/login`, `/forgot-password` y `/reset-password` son pantallas centrales.
- Los clientes Supabase de servidor y navegador están centralizados en `src/lib/supabase/`.
- `/dashboard` verifica la sesión y resuelve el único colegio asignado a la cuenta.
- Las rutas de módulos viven bajo el espacio institucional autenticado.
- `src/lib/auth/permissions.ts` obtiene permisos de los roles de membresía. RLS sigue siendo la autoridad final.
- El portal familiar central está en `/dashboard/[slug]/portal`; no se desarrolla un sitio de tutor independiente.
- Las rutas `/demo/...` no son el producto final ni sustituyen flujos persistentes.

El dashboard no ofrece selector de colegios. Si no hay membresía activa, se informa que el administrador debe habilitar la cuenta. Si aparecen varias membresías activas en esta instalación, el acceso se bloquea de forma segura y se solicita revisión administrativa; nunca se muestra un selector.

## 4. Bloqueo de base de datos identificado

La auditoría `docs/database/supabase-foundation-inventory.md` indica que el baseline fundacional no está completo en la secuencia versionada. Entre las dependencias asumidas por las migraciones están:

- `public.institutions`
- `public.campuses`
- `public.memberships`
- `public.profiles`
- `public.roles`
- `public.permissions`
- `public.membership_roles`
- `public.role_permissions`

La primera migración académica crea tablas que referencian instituciones, sedes y membresías. La migración de perfil presupone `public.profiles`. `supabase/config.toml` conserva el placeholder `your-project-ref`.

**Regla:** no inventar el DDL, no ejecutar migraciones contra Supabase alojado y no cambiar proyectos hosted. Recuperar primero una fuente schema-only verificable; luego reconstruir y validar en Supabase local limpio.

## 5. Integración funcional

### Identidad y permisos
- Una cuenta autenticada mantiene una única sesión en todo el sitio.
- La instalación tiene un solo colegio configurado; el contexto no se elige desde un selector.
- Los roles se asignan a la membresía y no se aceptan desde metadatos editables por el usuario.
- Cada operación verifica membresía activa, rol, permiso y alcance institucional en servidor y RLS.
- Cambiar de módulo no solicita otro login.

### Datos compartidos
- PostgreSQL es el origen de verdad.
- Las entidades académicas mantienen relaciones y claves foráneas coherentes.
- Los módulos consumen servicios/RPC tipados y reutilizables; no duplican datos maestros.
- Matrícula es la fuente de verdad para nivel, curso, división y ciclo lectivo.
- Tutoría se vincula con estudiantes matriculados mediante una relación autorizada; no crea una ficha académica paralela.
- Tareas, asistencia, boletines, citaciones, mensajes y notificaciones deben referenciar los mismos registros de origen.

### Navegación
- Un solo sitio, layout, navegación y sistema visual.
- Login y recuperación centrales.
- Todos los módulos se encuentran dentro de la aplicación autenticada.
- La visibilidad de opciones en pantalla no reemplaza autorización del servidor ni RLS.

## 6. Secuencia de ejecución

### Fase 1 — Fundamento reproducible
1. Recuperar/verificar el DDL schema-only de las entidades fundacionales y dependencias.
2. Configurar Supabase local sin `supabase link`.
3. Aplicar migraciones en una base local limpia.
4. Corregir orden y dependencias hasta lograr reconstrucción reproducible.
5. Comparar el esquema resultante con `src/types/database.types.ts`.
6. Probar autenticación, RLS y permisos con identidades ficticias locales.

Criterio de salida: una base vacía se reconstruye con migraciones versionadas y las políticas críticas pasan pruebas positivas y negativas.

### Fase 2 — Núcleo institucional único
1. Completar altas/invitaciones y ciclo de vida de cuentas y membresías.
2. Asegurar catálogo de roles/permisos y asignaciones iniciales del colegio.
3. Centralizar resolución de membresía y autorización sin selector institucional.
4. Verificar perfil de usuario y perfiles por rol sin duplicar identidad.

### Fase 3 — Integración funcional de módulos
1. Mantener todos los módulos bajo el mismo Next.js y dominio.
2. Conectar cada pantalla a servicios persistentes y contratos tipados.
3. Eliminar flujos que dependan de fixtures locales como comportamiento de aplicación.
4. Unificar perfiles y navegación para administración, directivos, docentes, preceptores, estudiantes y tutores.
5. Completar relaciones entre matrícula, docentes, familias, aulas, tareas, evaluaciones, boletines, asistencia, mensajes y notificaciones.

### Fase 4 — Portal del tutor definitivo
1. Reutilizar el portal familiar central existente.
2. Permitir editar el perfil de la cuenta autenticada con controles de privacidad.
3. Permitir vincular estudiantes ya matriculados.
4. Solicitar sólo los datos de identidad definidos por el colegio; leer nivel, curso, división y ciclo desde matrícula.
5. Verificar autorización del lado servidor antes de registrar una relación.
6. Proteger contra enumeración, fuerza bruta, abuso y exposición de identificadores.
7. Reflejar vínculos autorizados en tareas, asistencia, boletines, citaciones, mensajes y notificaciones.

### Fase 5 — Calidad y publicación única
- Pruebas unitarias, integración, E2E y permisos por rol.
- Pruebas de acceso denegado a estudiantes no vinculados.
- Validación de migraciones y RLS sobre base local limpia.
- Build, smoke tests y revisión de rutas públicas.
- Publicación sólo después de autorización explícita para despliegue.

## 7. Privacidad y datos

- Los datos sintéticos respetan estructura, constraints y relaciones operativas.
- Nunca se usa información real de menores en desarrollo, CI o demos.
- DNI, fecha de nacimiento e identificadores no se incluyen en logs, errores, URLs ni telemetría.
- La búsqueda de identidad se ejecuta en servidor, con autorización y limitación de intentos.
- Una coincidencia de DNI/fecha no concede acceso académico automáticamente.
- RLS protege cada tabla expuesta; los permisos de UI no sustituyen RLS.
- Nunca exponer claves secretas o `service_role` al navegador.
- Backups, restauración y auditoría forman parte de los criterios de producción.

## 8. Límites operativos

- Sólo trabajar en `mariotonygomez81-debug/EDUNEXA-public`, rama `feature/tutor-module`.
- No usar el repositorio privado ni `feature/student-module-mobile`.
- No modificar ni fusionar PR #3.
- No modificar producción, Supabase hosted ni Render; no desplegar.
- No ejecutar SQL de escritura en proyectos alojados.
- No crear servicios, cuentas, contratos ni costos.
- El proveedor de IA autorizado es exclusivamente Groq; no incorporar IA local.

## 9. Expansión futura — fuera del alcance actual

Cuando el usuario lo indique, cada colegio podrá tener su propia instalación independiente: repositorio GitHub, base Supabase y espacio Render. El acceso global del Superadministrador se diseñará en esa etapa. No implementar ahora selector de instituciones, multitenancy, superadministración global ni automatización de provisión.

## 10. Criterio final de aceptación

EDUNEXA estará integrada cuando una persona inicie sesión una sola vez, acceda al único colegio configurado y utilice módulos persistentes que compartan datos institucionales, con permisos aplicados en servidor y base de datos. Ningún módulo se considera integrado sólo por tener una pantalla o aparecer en el menú.
