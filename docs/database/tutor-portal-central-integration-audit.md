# Auditoría de integración del portal del tutor

- Fecha: 2026-11-24
- Repositorio: `mariotonygomez81-debug/EDUNEXA-public`
- Rama: `feature/tutor-module`
- Alcance: inspección estática del código versionado. Sin conexión a Supabase hosted, sin escrituras SQL, sin despliegues.

## 1. Resultado ejecutivo

El portal familiar ya está alojado en la aplicación central de EDUNEXA: `src/app/dashboard/[slug]/portal/page.tsx`. No es necesario crear otro sitio ni otro login para tutores. La página valida la sesión con Supabase Auth, comprueba la membresía institucional activa y exige que la membresía tenga el rol `student` o `guardian`.

La página consume `list_my_portal_students` y, para cada estudiante vinculado que no sea la propia cuenta, consulta `list_my_child_assignment_progress`. También consulta notificaciones dirigidas a la membresía y boletines publicados para los estudiantes devueltos por el RPC.

**La integración de consulta está avanzada; el alta/vinculación de hijos y la edición del perfil del tutor no están implementadas en esta ruta central.** La demo bajo `/demo` no debe considerarse sustituto del flujo definitivo.

## 2. Matriz de funcionalidades observadas

| Área | Evidencia en código | Estado de esta auditoría |
|---|---|---|
| Autenticación central | `supabase.auth.getUser()` y redirección a `/login` | Presente |
| Pertenencia institucional | Consulta de `memberships` por usuario, institución y estado activo | Presente |
| Rol de acceso | Consulta de `membership_roles` y comprobación `student` / `guardian` | Presente |
| Estudiantes vinculados | RPC `list_my_portal_students` | Integración de lectura presente; contrato SQL/RLS requiere validación local |
| Tareas y entregas | RPC `list_my_child_assignment_progress` por estudiante | Integración de lectura presente; SQL de progreso aún figura como borrador en las pruebas estáticas |
| Boletines | Lectura de `report_card_snapshots` filtrada por IDs devueltos por el RPC | Presente en UI; la seguridad final depende de RLS |
| Notificaciones | Filtrado por `institution_id` y `recipient_membership_id` | Presente |
| Asistencia | Ruta hija `portal/attendance/[studentId]` y RPC de asistencia | Presente; revisar autorización negativa en pruebas locales |
| Mensajes y citaciones | Rutas centrales y RPCs de membresía/rol | Integración cubierta por prueba estática |
| Edición de perfil del tutor | No se observa formulario/acción en la página central auditada | Pendiente |
| Vincular un hijo matriculado | No se observa acción/formulario de vinculación en la página central auditada | Pendiente |
| Desvincular o revocar autorización | No se observa flujo en la página central auditada | Pendiente; requiere política institucional y auditoría |

## 3. Hallazgos de seguridad y calidad

1. La UI no es la autoridad de autorización. Los RPC, RLS y restricciones de base deben impedir que un tutor consulte estudiantes no vinculados, incluso manipulando parámetros o llamando directamente a la API.
2. La vinculación no debe resolverse desde el navegador mediante consultas directas a DNI o fecha de nacimiento. La verificación debe ejecutarse en servidor/base, con límites de intentos, respuesta que no permita enumerar estudiantes y auditoría sin guardar DNI/fecha en logs.
3. Una coincidencia de identidad no debe conceder acceso académico automáticamente. Debe existir una relación de tutoría verificable y un estado de aprobación/confirmación definido por el colegio.
4. Nivel, curso, división y ciclo lectivo deben provenir de la matrícula vigente; no deben ser datos ingresados por el tutor.
5. Los boletines y asistencia requieren pruebas negativas: tutor A no puede consultar estudiante de tutor B, estudiante no vinculado, registro de otra institución o datos no publicados.
6. Los errores de RPC deben fallar de forma cerrada y no mostrar detalles internos ni identificadores sensibles.

## 4. Bloqueo fundacional de Supabase

El inventario `docs/database/supabase-foundation-inventory.md` confirma que la secuencia versionada no contiene un baseline autoritativo para ocho objetos fundacionales: `institutions`, `campuses`, `memberships`, `profiles`, `roles`, `permissions`, `membership_roles` y `role_permissions`.

La revisión del upstream privado y de las migraciones disponibles tampoco encontró un dump o baseline completo. Sin una fuente schema-only autorizada o una especificación DDL aprobada, no es seguro inventar esas tablas ni escribir migraciones que dependan de sus columnas, constraints, triggers, grants y políticas reales.

El inventario también registra que el entorno de esta sesión no dispone de Docker ni Supabase CLI para reconstruir una instancia local. No se consultó ni modificó ninguna base alojada.

## 5. Próximos pasos técnicos, en orden

1. Obtener un dump **sólo de esquema**, sin filas ni datos personales, con procedencia y versión identificables; alternativamente, aprobar una especificación DDL completa de los ocho objetos fundacionales.
2. Preparar Supabase local aislado y reconstruir desde cero, sin `supabase link` ni credenciales cloud. Validar orden de migraciones, Auth, triggers, FK, RLS, grants, RPC y tipos TypeScript.
3. Con el esquema validado, documentar y probar el contrato real de `list_my_portal_students`, incluyendo tutoría, matrícula activa, alcance institucional y permisos de asistencia/calificaciones.
4. Implementar en el portal central la edición segura del perfil del tutor y el flujo persistente para solicitar/vincular un estudiante matriculado. No usar fixtures locales como sustituto.
5. Definir aprobación, revocación y auditoría de la relación tutor-estudiante. Agregar controles anti-enumeración y limitación de intentos.
6. Ejecutar pruebas automatizadas positivas y negativas con usuarios y estudiantes sintéticos en PostgreSQL/Supabase local.
7. Sólo después de superar esas pruebas, considerar cualquier publicación; requiere autorización específica y no forma parte de esta etapa.

## 6. Restricciones respetadas

- Sólo repositorio `mariotonygomez81-debug/EDUNEXA-public`, rama `feature/tutor-module`.
- Un solo colegio en esta instalación; sin selector multiinstitución ni superadministrador global.
- Sin SQL de escritura ni cambios en Supabase hosted.
- Sin despliegues ni cambios en Render.
- Sin datos reales de menores.
- Groq sigue siendo el único proveedor de IA autorizado; esta etapa no requiere IA.


## 7. Revisión detallada de RPC y RLS del portal

### RPC de estudiantes y asistencia

- `private.list_my_portal_students_impl(uuid)` valida `auth.uid()`, busca membresía activa en la institución indicada y exige un rol `student` o `guardian`.
- La lista se construye exclusivamente desde `student_memberships` (cuenta propia) y `guardians → student_guardians` (estudiantes a cargo). La consulta une el estudiante por `institution_id` y obtiene la matrícula activa desde `enrollments`; no recibe curso/división del usuario.
- Los contadores de asistencia sólo consideran sesiones `submitted` o `locked` y quedan condicionados por `private.can_access_student(..., 'attendance.read')`.
- `private.list_my_student_attendance_impl(uuid,uuid,integer)` exige usuario autenticado, membresía activa y permiso de acceso al estudiante. Limita el resultado a un máximo de 100 registros y sólo devuelve sesiones presentadas o bloqueadas.
- Los dos wrappers de `public` son `SECURITY INVOKER`; las implementaciones privadas son `SECURITY DEFINER`, usan `search_path = ''` y califican los objetos con su esquema. Los permisos de ejecución de los RPC públicos se conceden a `authenticated`, no a `anon`/PUBLIC.

### RLS de relaciones tutor-estudiante

- `student_guardians` tiene lectura condicionada por `private.can_access_student(..., 'students.read')` o permiso administrativo `students.manage`.
- Alta, modificación y eliminación de `student_guardians` quedan limitadas a `students.manage`.
- `student_memberships` permite lectura propia de la cuenta activa y operaciones administrativas con `students.link_membership`; al vincular exige que la membresía destino esté activa y tenga rol `student`.
- Esto protege la relación contra escrituras directas de tutores, pero confirma que **no existe un flujo de solicitud autónoma del tutor** en la base versionada. Para implementarlo habrá que definir una solicitud pendiente y un proceso de aprobación institucional; no se debe abrir INSERT directo sobre `student_guardians`.

### Boletines: permiso independiente

La migración `20261124010000_report_card_audience_permissions.sql` separa el permiso general `grades.read` de la visibilidad de boletines: agrega `student_guardians.can_view_report_cards` (por defecto `false`) y `report_card_workflows.publication_audience` (`student`, `guardian`, `both`). La política de `report_card_snapshots` sólo deja leer snapshots de workflows publicados y cuya audiencia autoriza al usuario. Es una separación de permisos adecuada y de denegación por defecto.

**Corrección aplicada en el portal:** el historial académico se calculaba sólo cuando `student.can_view_grades` era verdadero, aunque RLS pudiera autorizar la lectura del snapshot por `can_view_report_cards`. Se modificó `src/app/dashboard/[slug]/portal/page.tsx` para construir el historial a partir de los snapshots que la consulta ya recibió filtrados por RLS. Esto respeta el permiso específico de boletines sin ampliar acceso.

### RPC de tareas: dependencia no versionada

La página invoca `public.list_my_child_assignment_progress(uuid,uuid)` para cada estudiante a cargo. El test `guardian_assignment_progress_security.test.sql` espera ese RPC y aclara que debe aplicarse un borrador previo; sin embargo, **no aparece una migración que cree ese RPC ni su implementación privada en la secuencia versionada de `supabase/migrations` revisada**. En una reconstrucción limpia desde las migraciones del repositorio, el seguimiento de tareas del tutor no queda disponible. La UI actualmente absorbe el error y muestra que el seguimiento todavía no está habilitado.

No se creó una migración improvisada porque falta validar el esquema fundacional, las relaciones exactas de aula/matrícula/entregas y el alcance de las calificaciones. Debe incorporarse como migración versionada y con prueba positiva/negativa una vez recuperada la base local completa.

## 8. Prueba automatizada agregada

Se agregó `supabase/tests/database/guardian_portal_rpcs_security.test.sql` con 25 aserciones pgTAP para verificar:

- RLS habilitado en las tablas que alimentan el portal.
- Existencia de ambos RPC públicos y sus implementaciones privadas.
- Wrappers públicos `SECURITY INVOKER` e implementaciones privadas `SECURITY DEFINER`.
- Ejecución permitida a `authenticated` y denegada a `anon`.
- Rechazo de usuarios sin membresía activa y de llamadas sin JWT.

La prueba **no se ejecutó**: la secuencia fundacional aún no se puede reconstruir de forma reproducible y esta sesión no dispone del stack local Supabase/Docker. No se realizaron consultas ni escrituras sobre una base alojada.

## 9. Estado de esta iteración

- Corrección de UI aplicada: historial de boletines respeta el permiso de audiencia específico.
- Prueba pgTAP agregada, pendiente de ejecución local.
- No se modificaron migraciones existentes ni se inventó DDL fundacional.
- RPC de tareas, solicitud tutor-estudiante y pruebas positivas de relación siguen pendientes.
