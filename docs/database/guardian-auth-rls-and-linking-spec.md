# Auditoría de autorización Tutor, pruebas Auth/RLS y especificación de vinculación

- Fecha: 2026-11-24
- Repositorio: `mariotonygomez81-debug/EDUNEXA-public`
- Rama: `feature/tutor-module`
- Base de revisión: commit `a6c1df069f70f9956fc51a39cfb4011517cd7cab`
- Alcance: inspección estática de migraciones y borradores; diseño de pruebas. Sin conexión ni escrituras en Supabase hosted. Sin cambios en Render.
- Estado: especificación; las pruebas descritas no se consideran ejecutadas.

## 1. Hallazgo de baseline

La secuencia versionada no permite reconstruir una instalación Supabase limpia: faltan las definiciones fundacionales completas de `institutions`, `campuses`, `memberships`, `profiles`, `roles`, `permissions`, `membership_roles` y `role_permissions`. Las migraciones académicas y de autorización presuponen esos objetos.

No crear una migración de Tutor ni ejecutar pgTAP integral hasta contar con un dump **schema-only** autorizado (sin filas ni datos personales) o una especificación DDL formalmente aprobada. La ausencia de baseline no se resuelve copiando el estado de una instancia hosted ni inventando columnas.

## 2. Contratos de autorización observados

### 2.1 `private.has_institution_permission(institution_id, permission_key)`

Definida en `20261120030658_create_private_permission_helpers.sql`.

- SQL, `STABLE`, `SECURITY DEFINER`, `search_path = ''`.
- Busca una membresía del usuario `auth.uid()` en la institución indicada, con `status = 'active'`.
- Une `membership_roles`, `role_permissions` y `permissions`; retorna booleano.
- Revoca ejecución a `PUBLIC` y `anon`; concede a `authenticated`.
- No recibe ni devuelve identificadores de membresía/rol, sólo booleano.

### 2.2 `private.can_access_student(student_id, institution_id, permission_key)`

Definida en `20261120035955_enable_scoped_academic_access.sql`.

- SQL, `STABLE`, `SECURITY DEFINER`, `search_path = ''`.
- Exige usuario autenticado, membresía activa, institución coincidente y permiso institucional.
- Aplica ámbito según rol: administración institucional; docente/preceptor con asignación vigente y matrícula activa; tutor con vínculo explícito `guardians -> student_guardians`; alumno con `student_memberships`.
- Para tutores limita `grades.read` con `student_guardians.can_view_grades` y `attendance.read` con `can_view_attendance`.
- Revoca a `PUBLIC` y `anon`; concede a `authenticated`.

### 2.3 Riesgo de composición de roles que requiere prueba

Ambos helpers son consultados por funciones/políticas posteriores. En `can_access_student`, la rama de ámbito se evalúa para una fila de rol `r`, pero `has_institution_permission` vuelve a buscar el permiso en **cualquiera** de los roles de esa membresía. Por tanto, una membresía con múltiples roles podría combinar el permiso concedido por un rol con el ámbito de otro rol.

Esto no demuestra por sí solo una vulnerabilidad explotable: el producto puede definir permisos aditivos entre roles. Pero sí deja una decisión de autorización ambigua. Antes de aprobar el modelo hay que definir si el permiso debe pertenecer al mismo rol que aporta el ámbito. La prueba negativa de la sección 4.4 debe decidirlo. Si se exige coincidencia, el helper de ámbito debe comprobar permiso y rol en la misma fila de `membership_roles` (o recibir un rol explícito), en vez de consultar un booleano global separado.

Revisar el mismo patrón en `private.can_access_classroom`: también combina una fila de rol `r` con `has_institution_permission(institution, key)`.

## 3. RPC de progreso de tareas: revisión del borrador

Archivo actual: `docs/database/guardian-assignment-progress.draft.sql`. No es una migración versionada.

Controles favorables observados:
- exige `auth.uid()`, membresía activa y rol `guardian`;
- exige permiso institucional `classroom.read`;
- limita resultados al vínculo explícito tutor-estudiante y matrícula activa;
- sólo devuelve tareas publicadas;
- oculta `score` y `max_score` salvo que el permiso institucional de notas y `student_guardians.can_view_grades` estén habilitados;
- no devuelve cuerpo/archivo de entrega, instrucciones, feedback docente ni historial privado;
- wrapper público `SECURITY INVOKER`; implementación privada `SECURITY DEFINER`, `search_path = ''`; ejecución concedida a authenticated y revocada a anon/PUBLIC.

Pendientes que deben resolverse antes de migrarlo:
1. Probar el permiso por rol (riesgo de composición de §2.3).
2. Probar que el vínculo tutor-hijo y la matrícula sean actuales y de la misma institución.
3. Confirmar el tratamiento de varias membresías activas del mismo usuario en una institución; el helper actual de permiso acepta cualquiera, mientras el borrador selecciona una membresía guardian con `LIMIT 1`.
4. Confirmar el contrato exacto de `sub.review_status` y los tipos de las columnas contra el baseline real.
5. Confirmar si `classroom.read` debe ser permiso suficiente para metadatos de progreso, independientemente de la visibilidad de notas.
6. La prueba PostgreSQL aislada actual es una fixture lógica, no prueba Supabase Auth/RLS real.

## 4. Plan de pruebas de integración Auth/RLS (sólo local)

Crear un proyecto Supabase temporal/local después de recuperar baseline; cargar exclusivamente datos sintéticos. Usar dos instituciones, dos tutores, dos estudiantes, dos matrículas, roles distintos y asignaciones ficticias. Establecer JWT/Auth claims mediante el mecanismo de pruebas local, no falsificar `auth.uid()` en producción.

### 4.1 `has_institution_permission`
- Sin JWT / `auth.uid() IS NULL`: false o error cerrado, según contrato elegido.
- Usuario sin membresía: false.
- Membresía suspendida/inactiva: false.
- Membresía activa sin rol que tenga permiso: false.
- Permiso concedido en institución A consultado para institución B: false.
- Permiso concedido a rol correcto en institución A: true.
- Usuario con dos roles, permiso sólo en rol X y ámbito sólo en rol Y: comprobar el resultado contra la decisión formal de §2.3.
- `anon` no puede ejecutar la función; `authenticated` sí.

### 4.2 `can_access_student`
- Tutor A vinculado al estudiante A con permiso correspondiente: true.
- Tutor A solicita estudiante B no vinculado: false.
- Tutor A con vínculo a A pero `can_view_grades=false`: false para `grades.read`.
- Tutor A con `can_view_attendance=false`: false para `attendance.read`.
- Vínculo de otra institución, estudiante inexistente o institución cruzada: false.
- Matrícula retirada: false para ámbitos que exigen matrícula vigente.
- Alumno: sólo su propio `student_memberships`.
- Docente: sólo divisiones/asignaturas cubiertas por asignación vigente.
- Asignación docente vencida/futura: false.
- Cuenta con múltiples roles: validar que no se mezclen permiso y ámbito de roles diferentes, si esa es la política aprobada.
- `anon` no puede ejecutar el helper; `authenticated` sí.

### 4.3 RPC `list_my_child_assignment_progress`
- Tutor vinculado y matrícula vigente: sólo tareas publicadas de la división vigente.
- Tarea no publicada o publicación futura: no aparece.
- Tutor de otro estudiante: denegado o conjunto vacío, según contrato estable; nunca datos ajenos.
- Matrícula vencida/retirada: sin resultados.
- Tutor inactivo o sin rol guardian: error de autorización.
- Sin JWT: error de autenticación.
- `classroom.read` ausente: denegado.
- `grades.read` ausente o `can_view_grades=false`: progreso sin calificaciones ni máximos.
- Ambos permisos presentes: calificación sólo para el hijo autorizado.
- Otra institución: denegado.
- Verificar que el JSON/recordset no incluya cuerpo, ruta de archivo, feedback, instrucciones ni otros estudiantes.
- Ejecutar RPC como `authenticated`; comprobar `anon` y `PUBLIC` sin EXECUTE.
- Manipular `p_student_id` y `p_institution_id` manualmente; no debe ampliar el alcance.

### 4.4 Aislamiento y RLS
- Tutor A no puede leer directamente `students`, `student_guardians`, `enrollments`, `submissions` o `report_card_snapshots` de B.
- Tutor no puede insertar, actualizar ni borrar `student_guardians`.
- Tutor no puede insertar `student_memberships`.
- Miembro de institución A no puede leer ni mutar filas de B.
- Publicación de boletín y audiencia `student/guardian/both` respetadas.
- Revocar permiso o vínculo debe retirar acceso inmediatamente en consultas posteriores.
- Confirmar que funciones SECURITY DEFINER tienen `search_path = ''`, referencias calificadas, EXECUTE mínimo y no filtran errores internos.

## 5. Especificación del flujo seguro de vinculación tutor-estudiante

### Estados propuestos
`pending`, `approved`, `rejected`, `expired`, `cancelled`, `revoked`. La nomenclatura final y retención deben aprobarse antes del DDL.

### Emisión institucional
1. Personal con permiso institucional específico emite un código aleatorio criptográficamente seguro, de un solo uso, con expiración corta y límite de intentos.
2. Persistir sólo hash del código; nunca guardar el código en claro ni registrarlo en logs.
3. Código ligado a institución y estudiante, con estado, vencimiento, creador y auditoría. Evitar datos identificatorios del alumno en el código.
4. Revocar/regenerar invalida inmediatamente el código anterior.

### Solicitud del tutor
1. Tutor inicia sesión en el portal central y selecciona “Solicitar vinculación”.
2. Envía el código; el servidor valida hash, vencimiento, institución, estado, límite de intentos y usuario autenticado.
3. Respuesta genérica que no permita enumerar estudiantes, códigos válidos o matrículas.
4. Se crea una solicitud pendiente vinculada al usuario/membresía del tutor; no se crea `student_guardians` ni se habilita acceso al legajo.
5. Duplicados idempotentes; rate limit por cuenta, IP y código; registro de intentos sin PII sensible.

### Revisión y aprobación institucional
1. Personal autorizado revisa la solicitud en cola institucional.
2. Verifica identidad y representación legal fuera del mecanismo de consulta pública del portal.
3. Aprueba/rechaza con actor, fecha, motivo codificado y trazabilidad.
4. Sólo aprobación puede crear/reutilizar `guardians` y crear `student_guardians`.
5. La operación se ejecuta en una transacción, comprueba institución, membresía activa, rol guardian, estudiante existente y no duplicidad.
6. Permisos individuales `can_view_grades`, `can_view_attendance`, `can_view_report_cards`, `can_authorize` se asignan explícitamente conforme a la política del colegio; defaults conservadores y separados.

### Revocación y auditoría
- Revocar el vínculo sin borrar la historia de aprobación.
- La revocación invalida inmediatamente RPC, RLS, boletines y asistencia.
- Eventos auditables: emisión, intento fallido, solicitud, aprobación, rechazo, expiración, revocación y cambio de permisos.
- No almacenar DNI, fecha de nacimiento, documentos ni códigos en texto claro en logs.
- Proteger la cola: sólo personal con permiso específico de gestión de vínculos; el tutor sólo ve sus propias solicitudes y estados genéricos.

### Contrato lógico propuesto (no DDL)
- `issue_guardian_link_code(student_id)`: RPC administrativo, permiso específico, emite hash/caducidad.
- `request_guardian_student_link(code)`: RPC autenticado, crea solicitud pendiente; sin acceso al estudiante.
- `list_guardian_link_requests()`: RPC institucional, sólo usuarios autorizados, scope por institución.
- `review_guardian_link_request(request_id, decision)`: RPC administrativo transaccional; revalida todo antes de mutar relación.
- `revoke_guardian_student_link(link_id)`: RPC administrativo, revoca vínculo y registra auditoría.

Los nombres son conceptuales y no deben usarse en código hasta validar baseline, catálogo de permisos y esquema de auditoría. No exponer RPC que acepte libremente `student_id` y cree la relación desde la cuenta del tutor.

## 6. Criterios de salida antes de una migración

- Baseline schema-only autorizado o DDL fundacional aprobado.
- Contrato de roles/permisos y la decisión de §2.3 documentados.
- Tipos/constraints confirmados contra esquema local reconstruido.
- Pruebas pgTAP Auth/RLS ejecutadas localmente con dos instituciones y datos sintéticos.
- Pruebas positivas y negativas del RPC y de la vinculación aprobadas.
- Revisión de SECURITY DEFINER, grants, RLS y exposición Data API.
- Migración versionada sólo después de cumplir lo anterior; nunca aplicar sobre hosted durante esta fase.

## 7. Límites de esta iteración

- Sólo lectura de GitHub en la rama indicada para la auditoría.
- No se consultó ni modificó Supabase hosted.
- No se modificó Render ni se desplegó.
- No se creó una migración ejecutable ni se declaró aprobada la prueba Auth/RLS.
