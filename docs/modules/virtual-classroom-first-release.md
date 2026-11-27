# Aula virtual: diseño de primera entrega

## Estado verificado

La instalación de desarrollo ya contiene las tablas iniciales `virtual_classrooms`, `classroom_members`, `classroom_materials`, `assignments` y `submissions`, además de los permisos `classroom.manage` y `classroom.participate`.

Estas tablas tienen RLS habilitado. En el estado auditado, las políticas de escritura y lectura de materiales, tareas, entregas y miembros mantienen el acceso del cliente bloqueado. La lectura inicial de aulas solo exigía una membresía institucional activa y era demasiado amplia; se reemplazó por una política de denegación explícita en la migración `20261120042208_close_unscoped_virtual_classroom_reads`. Por eso no se habilita el módulo ni se retiran los bloqueos hasta completar políticas de alcance por aula, división, materia y estudiante.

## Objetivo funcional

Una experiencia de aula virtual inspirada en Classroom, integrada con la gestión académica PIE:

- Aulas vinculadas a una división y, opcionalmente, a una materia del curso.
- Publicaciones de materiales y recursos de clase.
- Tareas con instrucciones, fecha límite y puntaje máximo.
- Entregas de alumnos con texto y/o archivo privado.
- Corrección docente con puntaje y devolución.
- Vista de consulta para directivos y tutores, respetando sus vínculos y permisos.
- Historial de publicación, entrega y corrección.

## Roles y alcance

| Perfil | Alcance previsto |
| --- | --- |
| Administrador institucional | Lee, crea y administra aulas de su instalación; puede calificar y gestionar entregas. |
| Docente | Lee, administra y califica únicamente aulas correspondientes a sus asignaciones vigentes de división o materia/curso. |
| Directivo | Consulta aulas y actividad académica institucional; no modifica materiales, tareas ni entregas. |
| Alumno | Consulta aulas de sus divisiones activas y entrega/actualiza únicamente sus propios trabajos. |
| Tutor | Consulta materiales, tareas, estado de entrega y devolución únicamente de alumnos vinculados; no publica, califica ni entrega en nombre del alumno. |
| Administrativo / preceptor | Sin acceso automático al contenido pedagógico; se habilitará solo mediante permiso explícito y alcance definido. |

La interfaz nunca será la autoridad de acceso. Las acciones de servidor validan sesión, membresía, rol, asignación y pertenencia al colegio; PostgreSQL vuelve a validar cada operación mediante RLS. Se separaron los permisos `classroom.read`, `classroom.manage`, `classroom.submit` y `classroom.grade`. Las funciones `private.can_access_classroom`, `private.can_submit_to_assignment` y `private.can_access_submission` aplican el alcance institucional, de división, materia, matrícula y vínculo familiar; las consultas de entregas de alumnos/tutores exigen matrícula activa. Los permisos de ejecución se verificaron para `authenticated` y denegaron `anon`. Las políticas de tablas siguen cerradas hasta probar la matriz positiva con cuentas reales.

## Reglas de datos

1. Cada aula pertenece a una única institución y división.
2. Si se informa `course_subject_id`, debe pertenecer al curso de la división y a la misma institución.
3. Docentes solo administran aulas dentro de asignaciones vigentes.
4. Los participantes se derivan de membresías escolares y relaciones académicas verificadas; no se aceptan IDs arbitrarios enviados por el navegador. Un trigger de base de datos valida que la materia elegida para un aula pertenezca al mismo curso que su división.
5. Un alumno solo puede crear o actualizar su propia entrega y solo mientras la tarea admita entregas.
6. Una entrega pertenece a la misma institución, tarea y alumno; las claves foráneas compuestas deben conservar ese alcance.
7. La corrección solo puede realizarla un docente autorizado o administrador institucional.
8. Los tutores tienen lectura condicionada al vínculo vigente y a los permisos correspondientes; no pueden suplantar al alumno.
9. La eliminación de aulas, tareas y entregas no será una operación normal de usuario. Se prioriza archivo/cierre y conservación de historial.
10. Toda fecha se interpreta y muestra con la zona horaria institucional.

## Archivos y privacidad

Los archivos de materiales y entregas irán a un bucket privado de Storage por instalación. No se usarán URLs públicas. La descarga se autoriza por políticas de Storage y/o URLs firmadas de corta duración después de comprobar el acceso al registro asociado.

Límites iniciales propuestos para la primera entrega: archivos de hasta 20 MB, lista permitida de tipos MIME educativos habituales, nombres de almacenamiento generados por el servidor, validación de tamaño y MIME real, y rutas segregadas por institución/aula/registro. No almacenar datos sensibles innecesarios en nombres de archivos ni metadatos.

Antes de habilitar Storage deben existir políticas que comprueben que el usuario tiene acceso a la tarea/material/entrega vinculada. El bucket no se considera protegido por el mero hecho de ser privado.

## Entrega incremental

### Etapa A — Seguridad y modelo
- [x] Auditar restricciones, claves foráneas, permisos, políticas actuales y asignaciones.
- [x] Separar permisos de lectura, gestión, entrega y calificación.
- [x] Crear función auxiliar de acceso por aula, división, materia, matrícula y vínculo familiar.
- [x] Crear funciones de autorización para entrega y consulta/corrección de trabajos.
- [x] Validar en base de datos que la materia del aula corresponda al curso de la división.
- [x] Mantener bloqueadas las operaciones de cliente no verificadas.
- [x] Preparar matriz detallada de pruebas RLS y aceptación en `docs/testing/virtual-classroom-rls-test-matrix.md`.
- [ ] Ejecutar pruebas positivas/negativas por rol antes de habilitar el acceso.

### Etapa B — Aulas y materiales
- Listado de aulas visibles según rol.
- Creación y edición de aula para administrador y docentes asignados.
- Publicación de materiales y recursos.
- Incorporación controlada de participantes desde las matrículas y asignaciones.

### Etapa C — Tareas y entregas
- Crear, publicar, cerrar y reabrir tareas.
- Entrega de texto y archivos privados por el alumno autenticado.
- Evitar entregas duplicadas por alumno/tarea; permitir actualización mientras esté abierta.
- Mostrar fecha límite y estado de entrega.

### Etapa D — Corrección
- Bandeja docente de entregas por tarea.
- Puntaje validado contra el máximo y devolución con límites de longitud.
- Consulta de devolución por alumno y tutor autorizado.
- Historial de cambios de corrección y auditoría.

### Etapa E — Integración y pruebas
- Integrar con el espacio institucional y navegación.
- Pruebas E2E con cuentas ficticias de todos los roles.
- Verificar aislamiento entre colegios, alumnos, aulas, tareas y archivos.
- Ejecutar lint, TypeScript, build y CI; no declarar listo hasta obtener resultados reales.

## Matriz mínima de aceptación

1. Un docente asignado puede crear y administrar el aula de su división/materia.
2. Un docente no asignado no puede listar, abrir, editar ni publicar en esa aula.
3. El administrador institucional puede administrar aulas de su colegio, nunca de otra instalación.
4. Un alumno ve únicamente aulas de sus divisiones activas y no puede consultar entregas de otros alumnos.
5. Un alumno no puede entregar en nombre de otro, aunque manipule el formulario o la petición.
6. Un tutor solo ve aulas y entregas de alumnos vinculados con permisos vigentes.
7. Un directivo consulta sin poder alterar materiales, tareas o entregas.
8. Administrativo y preceptor no obtienen acceso pedagógico solo por su rol.
9. Un usuario sin membresía activa no ve ningún registro.
10. Ningún archivo se descarga sin autorización sobre su registro asociado.
11. Las operaciones entre instituciones fallan por RLS y por claves foráneas.
12. Las fechas límite, estados y correcciones se validan también en el servidor/base de datos.

## Revisión de seguridad adicional (2026-11-20)

Se consultó directamente el catálogo PostgreSQL: las cinco tablas operativas del Aula Virtual y las dos tablas de historial conservan RLS y políticas explícitas de denegación para `authenticated`; no hay bucket de Storage. Las claves foráneas compuestas y la unicidad de entregas están presentes. Se inspeccionaron las definiciones de `private.can_access_classroom`, `private.can_submit_to_assignment` y `private.can_access_submission`; aplican membresía activa, asignación docente, matrícula y vínculo familiar según el permiso solicitado. En la consulta de estado hay 7 usuarios Auth, 7 perfiles y 7 membresías activas ficticias; existe 1 aula y 1 tarea de prueba, sin entregas. Security Advisor informa un único aviso: protección contra contraseñas filtradas desactivada en el plan actual.

Se creó la matriz `docs/testing/virtual-classroom-rls-test-matrix.md` con casos positivos/negativos para cada rol, manipulación de IDs, vencimiento de tareas y Storage. La matriz señala tres condiciones previas que deben resolverse antes de habilitar escritura: separar los campos que puede editar el alumno de los campos de corrección docente en `submissions`, incorporar historial de entregas/correcciones y validar límites de fecha/puntaje en toda ruta de escritura. No se abrió ninguna política.

## Pendientes antes de producción

- Hay siete usuarios Auth ficticios, siete perfiles y siete membresías activas. Aún faltan pruebas positivas autenticadas completas por rol y casos cruzados con una segunda división.
- No se habilitó el acceso del cliente a las tablas del aula virtual.
- No se creó el bucket privado de Storage ni sus políticas.
- Se incorporó el listado de aulas mediante `public.list_accessible_classrooms(uuid)` y el detalle de aula mediante `public.get_classroom_overview(uuid)`. Ambas RPC públicas son `SECURITY INVOKER`; sus implementaciones internas están en `private` y verifican identidad y permisos. El detalle devuelve metadatos, materiales y actividades; alumnos/tutores/directivos solo reciben contenido publicado, mientras que administrador/docente con permiso de gestión o corrección pueden ver borradores. No devuelve rutas internas de archivos ni datos de entregas.
- No se validó build de producción ni despliegue.
- Los límites de archivos y tipos MIME son parámetros iniciales sujetos a prueba y configuración institucional.


## Historial de entregas y calificaciones (2026-11-20)

Se incorporó una base de auditoría aditiva en la instalación de referencia:

- `submission_revisions` conserva una instantánea anterior cada vez que cambia el contenido de una entrega (texto, ruta de archivo o fecha de envío).
- `submission_grade_events` registra el valor anterior y nuevo de puntaje, devolución y docente calificador cuando cambia la corrección.
- Los registros conservan institución, entrega, número de revisión o fecha, y actor cuando la operación se ejecuta con una identidad Auth disponible.
- Las dos tablas tienen claves foráneas compuestas hacia la entrega y RLS habilitado.
- Las políticas explícitas deniegan acceso a `anon` y `authenticated`; no se habilitó lectura del historial en el cliente.
- Los triggers de base de datos escriben los eventos y las tablas impiden UPDATE/DELETE. Además, se revocaron INSERT/UPDATE/DELETE/TRUNCATE al rol `service_role` para estas tablas; conserva SELECT para inspección controlada. La función de trigger SECURITY DEFINER tiene `search_path` vacío y privilegios EXECUTE revocados a PUBLIC.
- Security Advisor consultado el 2026-11-20: un único aviso por protección contra contraseñas filtradas desactivada; la función pública de consulta de alumnos para calificaciones quedó como `SECURITY INVOKER`, con implementación privilegiada aislada en el esquema `private`.

Migraciones aplicadas y versionadas:
- `20261120044813_add_submission_revision_and_grade_history.sql`
- `20261120044827_explicitly_deny_submission_history_client_access.sql`
- `20261120044906_restrict_service_role_submission_history_mutations.sql`

**Alcance y límites:** no se habilitaron escrituras del Aula Virtual. Las cinco tablas funcionales continúan sin privilegios directos para `anon` y `authenticated`; las dos tablas de historial tampoco son accesibles directamente. Las RPC de listado y detalle se probaron en transacciones SQL revertidas bajo `authenticated`: administrador, directivo, docente asignado, alumno y tutor vinculado obtuvieron el aula y su material/actividad publicada; administrativo, preceptor y un UUID sin membresía recibieron `null` en el detalle. El control de borradores se verificó con el contenido demo publicado; falta añadir una fixture no publicada para probar su ocultamiento explícito. Estas pruebas no sustituyen inicio de sesión real ni E2E en navegador. No se creó bucket de Storage ni se implementaron entregas/correcciones. Próximo paso: RPC/acciones de gestión de materiales y actividades, luego entrega y calificación, con pruebas positivas y negativas por perfil antes de conceder acceso directo a tablas.


### Validación de calificaciones en PostgreSQL (2026-11-20)

Se añadieron controles de base de datos, no dependientes de la interfaz:
- `submissions.score` no puede ser negativo.
- Una nota solo puede registrarse si la tarea está publicada y tiene `max_score`.
- La nota no puede superar `max_score`.
- No se puede reducir el máximo de una tarea por debajo de una nota ya registrada.
- `assignments.max_score`, cuando se informa, debe ser mayor que cero.

Migraciones:
- `20261120045012_validate_submission_scores_against_assignment_maximum.sql`
- `20261120045025_enforce_published_assignment_grading_limits.sql`
- `20261120045032_require_positive_assignment_max_score.sql`

Estas validaciones no abren RLS ni conceden acceso de escritura. Siguen pendientes la separación de permisos por campo para alumno/docente, las acciones de servidor, el vencimiento de entregas y las pruebas con cuentas autenticadas.
