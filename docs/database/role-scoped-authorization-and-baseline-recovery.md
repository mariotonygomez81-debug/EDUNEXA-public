# Decisión de autorización por roles, catálogo observado y recuperación local

- Fecha: 2026-11-24
- Repositorio: `mariotonygomez81-debug/EDUNEXA-public`
- Rama: `feature/tutor-module`
- Auditoría de código: head `20c4112342b8d790f25cc0e8fd25afd534f7be2c` (antes de este documento)
- Alcance: inspección estática y especificación. No se modificó Supabase hosted ni Render. No se ejecutaron migraciones.

## 1. Decisión formal: permisos acumulativos, ámbito ligado al rol

Se adopta como regla de diseño:

1. Una membresía puede tener varios roles activos y sus permisos institucionales se acumulan (unión de permisos).
2. Una autorización contextual (estudiante, aula, división, asignación docente) sólo es válida si **el mismo rol** que satisface el ámbito posee el permiso solicitado.
3. Las excepciones administrativas se expresan explícitamente en la matriz del helper contextual; no se deducen de otro rol de la membresía.
4. El ámbito y el permiso siempre deben coincidir en la misma institución y membresía activa.
5. El rol no sustituye los flags individuales del vínculo tutor-estudiante, ni las condiciones de matrícula/asignación vigente.

La regla conserva el RBAC aditivo esperado para usuarios con varios cargos, pero impide que un rol preste permisos a otro rol que no los posee.

## 2. Hallazgo en helpers existentes

### 2.1 `private.has_institution_permission(uuid,text)`

Archivo: `20261120030658_create_private_permission_helpers.sql`.

La función busca permiso en cualquier fila `membership_roles` de una membresía activa de `auth.uid()`. Esto implementa correctamente la unión de permisos institucionales. Debe mantenerse con ese contrato, sin usarla como sustituto de una comprobación permiso+rol para ámbitos contextuales.

### 2.2 `private.can_access_student(uuid,uuid,text)`

Archivo: `20261120035955_enable_scoped_academic_access.sql`.

Hallazgo confirmado: itera `membership_roles` y `roles` para evaluar la rama de ámbito, pero invoca `has_institution_permission(institution_id,key)` que puede devolver true por otro rol. Ejemplo negativo: rol `guardian` aporta vínculo con estudiante; rol `student` (u otro rol) aporta el permiso; la rama guardian puede quedar habilitada por la combinación. La prueba debe demostrarlo en fixture antes de modificar.

### 2.3 `private.can_access_classroom(uuid,uuid,text)`

La primera definición está en `20261120042419_define_scoped_classroom_capabilities.sql`; fue reemplazada por `20261121012945_match_classroom_role_and_enrollment_scope.sql`. La versión posterior mejora asignación docente y vigencia de matrícula, pero conserva la composición: rama de rol contextual más helper de permiso acumulativo. Aplicar la misma regla de permiso ligado al rol.

### 2.4 `private.can_manage_division`

También en `20261120035955_enable_scoped_academic_access.sql`, repite el patrón. Aunque la solicitud actual se centra en tres helpers, la corrección debe incluir este helper o dejar explícitamente documentado por qué una política de escritura de división queda fuera. No debe quedar como bypass colateral.

## 3. Contrato de corrección recomendado (no migración)

Añadir helper privado conceptual:

`private.has_membership_role_permission(p_membership_id uuid, p_institution_id uuid, p_role_key text, p_permission_key text) returns boolean`

Debe:
- comprobar que `auth.uid()` es propietario de la membresía;
- comprobar membresía activa e institución exacta;
- unir `membership_roles` a `roles` y `role_permissions` a `permissions`;
- exigir `roles.key = p_role_key` dentro de la misma fila de asignación;
- retornar sólo booleano;
- ser SQL `STABLE SECURITY DEFINER`, `search_path = ''`, nombres totalmente calificados;
- revocar EXECUTE a `PUBLIC` y `anon`; conceder sólo a `authenticated` si la función es llamada desde otros helpers con el contexto del usuario;
- no aceptar un `membership_id` arbitrario que permita comprobar permisos de otra persona.

La alternativa preferida aún más simple para helpers contextualizados es integrar el join `role_permissions -> permissions` directamente en el `EXISTS` de la misma fila `membership_roles` y rol que satisface el ámbito. Evita una segunda búsqueda y reduce la superficie de ejecución. El helper separado sólo conviene si se reutiliza sin ambigüedad.

### Aplicación por helper

- `can_access_student`: en cada rama de rol, verificar permiso dentro de ese rol. La rama guardian mantiene además vínculo exacto y flags individuales para `grades.read` / `attendance.read`. La rama student mantiene su `student_memberships`; teacher/prefect mantienen asignación y matrícula vigentes; roles administrativos deben estar explícitamente permitidos para cada permiso.
- `can_access_classroom`: cada rama (institution_admin, director, teacher, student, guardian y roles read-only agregados por migraciones posteriores) debe declarar sus claves permitidas y comprobar que el rol tiene el permiso solicitado. Teacher conserva `assignment_type='teacher'`, asignación vigente y coincidencia división/asignatura. Student/guardian conservan matrícula vigente.
- `can_manage_division`: permiso debe estar en el mismo rol que habilita administración institucional o asignación de división. Confirmar si `prefect` tiene `attendance.manage` en catálogo antes de conservarlo.
- `has_institution_permission`: mantener unión acumulativa, documentar que no acredita ámbito por sí misma.

No generar todavía SQL ejecutable: el catálogo fundacional y su baseline están incompletos y no se dispone de una reconstrucción local para compilar y probar la función.

## 4. Catálogo de roles y permisos: evidencia y límites

### Claves de rol observadas en migraciones

Las migraciones revisadas hacen referencia explícita a estas claves:

- `institution_admin`
- `administrative`
- `director`
- `secretary` (creada por `20261121012613_add_secretary_institution_role.sql`)
- `teacher`
- `prefect`
- `student`
- `guardian`

Esto **no es un catálogo completo ni autoritativo**. Las tablas `roles`, `permissions`, `membership_roles` y `role_permissions` se presuponen en las migraciones y su baseline no está versionado. No se conoce el conjunto inicial, restricciones, unicidad, alcance, permisos heredados ni si hay claves adicionales.

### Permisos relevantes observados

Entre los permisos usados o sembrados por migraciones se encuentran:

- Institucionales/estudiantes: `institution.read`, `students.read`, `students.manage`, `students.link_membership`.
- Académicos: `attendance.read`, `attendance.manage`, `grades.read`, `grades.manage`.
- Aula: `classroom.read`, `classroom.submit`, `classroom.manage`, `classroom.grade`.
- Tutoría/boletines: `can_view_grades`, `can_view_attendance`, `can_view_report_cards` son flags de relación, no claves del catálogo de permisos.
- Soporte: `support.create`, `support.read`, `support.manage`, `support.escalate`.

La presencia de una clave en SQL no prueba que esté asignada a un rol en el catálogo final. No inventar ni completar asignaciones por inferencia.

### Observación sobre Secretaría

La migración `20261121012613_add_secretary_institution_role.sql` crea `secretary` y le asigna un conjunto de permisos; además retira `students.manage` de `administrative`. Este es un ejemplo de evolución deliberada del catálogo y confirma que la matriz debe auditarse por migración ordenada, no por un listado aislado.

## 5. Hallazgo adicional de migración de aulas

En `20261120042419_define_scoped_classroom_capabilities.sql`, la primera definición de `private.can_access_classroom` referencia `assigned_cs.id` sin declarar el alias `assigned_cs` en el `FROM` ni en un `JOIN` de esa función. La migración posterior `20261121012945_match_classroom_role_and_enrollment_scope.sql` reemplaza la función con una condición de asignación corregida, pero no evita que la migración anterior tenga que compilar al aplicarse.

Esto es un posible bloqueo de reconstrucción limpia que requiere confirmación en PostgreSQL local con `check_function_bodies` habilitado. No se cambió el archivo histórico para no ocultar el defecto ni reescribir historia sin una prueba de reproducción. Añadir una corrección posterior no basta si la migración anterior falla antes.

## 6. Pruebas negativas obligatorias

Preparar pgTAP/local con usuarios y datos sintéticos:

### Permisos acumulativos vs ámbito ligado al rol
1. Usuario U con roles guardian y student.
2. Guardian tiene vínculo con alumno A pero no permiso `students.read`; student tiene `students.read` pero sólo vínculo `student_memberships` a alumno B.
3. Consultar `can_access_student(A,institution,'students.read')` debe devolver false: no se mezcla permiso del rol student con vínculo guardian.
4. Invertir asignaciones: guardian tiene permiso y vínculo A; student no tiene permiso. Resultado true para A, si el vínculo/flag requerido existe.
5. Usuario con teacher sin asignación y otro rol con `classroom.grade`: no debe calificar un aula por el ámbito teacher.
6. Teacher con asignación a división X y permiso `classroom.grade` sólo en otro rol: false para aula X.
7. Teacher con permiso y asignación en el mismo rol: true para ámbito asignado.
8. Usuario con dos membresías institucionales; permiso de A no autoriza B.
9. Membresía suspendida o asignación expirada: false aunque exista permiso en otro rol.

### Regresión de permisos institucionales
10. `has_institution_permission` retorna true si cualquiera de los roles activos tiene el permiso (unión deliberada).
11. Retorna false sin membresía activa, sin rol o para institución distinta.
12. `anon`/PUBLIC no pueden ejecutar; `authenticated` sí.

### Tutor y aula
13. Guardian con vínculo A pero sin `can_view_grades`: no accede a calificaciones.
14. Guardian con `can_view_attendance=false`: no accede a asistencia.
15. Guardian con vínculo revocado o matrícula vencida: no ve aula/progreso.
16. Student sólo ve aula de su matrícula vigente.
17. Director/administrative/secretary sólo acceden a capacidades expresamente asignadas a ese rol.
18. Revocación de permiso o relación retira acceso en consultas siguientes.

No basta una prueba SQL unitaria: las pruebas deben ejecutar bajo roles/JWT reales de Supabase local y comprobar RLS directo, RPC y grants.

## 7. Recuperación del baseline y preparación local

El inventario `docs/database/supabase-foundation-inventory.md` sigue bloqueado. Se localizaron upstream privado y migraciones, pero no un baseline que cree las ocho tablas fundacionales:
`institutions`, `campuses`, `memberships`, `profiles`, `roles`, `permissions`, `membership_roles`, `role_permissions`.

No se debe reconstruir DDL a partir de tipos TypeScript o de referencias parciales. Solicitar una de estas fuentes:
1. schema-only dump autorizado y sin filas;
2. DDL fundacional aprobado por el responsable del producto;
3. clon/bundle del repositorio upstream original para inspeccionar objetos Git inalcanzables y reflogs, si se conserva.

Procedimiento local ya documentado en `docs/database/supabase-local-foundation-validation.md`:
- carpeta temporal fuera del repo;
- `project_id` local aislado;
- PostgreSQL local sin migraciones;
- catálogo de metadatos sólo lectura;
- no ejecutar `supabase link`, `db pull`, `db push`, `db dump`, `db reset` ni comandos remotos.

En el entorno de trabajo de esta sesión no se pudo ejecutar Docker/Supabase CLI. La preparación es documental, no una reconstrucción completada. Cuando haya runtime local, iniciar sólo Postgres con el procedimiento y validar la migración que contiene el alias `assigned_cs` antes de restaurar cualquier esquema. No usar hosted.

## 8. Límites y próximos pasos

- No se modificó Supabase hosted.
- No se modificó Render ni se desplegó.
- No se creó migración ejecutable.
- No se afirmó que Auth/RLS o la reconstrucción local estén aprobados.
- El siguiente paso es obtener baseline schema-only/DDL aprobado, luego reproducir la secuencia completa en Supabase local y ejecutar los casos §6. Tras reproducción, escribir una migración correctiva nueva que sustituya helpers sin reescribir migraciones históricas, acompañada de pgTAP y CI.
