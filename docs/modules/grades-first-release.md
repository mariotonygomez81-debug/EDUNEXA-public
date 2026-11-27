# Módulo de calificaciones: primera entrega

## Funciones incorporadas

- Acceso desde el espacio institucional en `/dashboard/[slug]/grades`.
- Creación de evaluaciones con título, división, materia/curso, período, fecha, puntaje máximo y descripción.
- Planilla de carga de notas por alumno con observación individual.
- Consulta de evaluaciones y calificaciones para perfiles con permiso de lectura.
- Guardado por lote mediante upsert y clave única institución/evaluación/alumno.

## Roles previstos

- `institution_admin`: crear evaluaciones y gestionar notas dentro de la instalación.
- `teacher`: crear evaluaciones y cargar notas solo en divisiones/materias alcanzadas por sus asignaciones.
- `director`, `student`, `guardian`: consulta sujeta a las políticas de acceso a cada estudiante.
- Los demás roles no reciben acceso por el solo hecho de iniciar sesión.

La autorización efectiva no depende de ocultar botones: PostgreSQL aplica RLS. La interfaz filtra divisiones según rol/asignaciones y las acciones de servidor validan sesión, membresía e institución. La base comprueba nuevamente los permisos al insertar/actualizar.

## Validaciones de servidor

- Puntaje máximo mayor que cero y hasta 1000.
- Nota entre cero y el puntaje máximo de la evaluación.
- Comentarios limitados a 500 caracteres.
- La división, materia y período deben pertenecer a la misma institución.
- La materia debe corresponder al curso de la división.
- El período debe corresponder al mismo ciclo lectivo que la división.
- Si se informa fecha de evaluación, debe estar dentro del período.
- La nota solo puede guardarse para alumnos que la RLS permita y que estén matriculados activamente en la división de la evaluación.

## Limitaciones pendientes

- La primera interfaz muestra hasta 50 evaluaciones.
- No incluye todavía promedios, boletines, equivalencias, escalas cualitativas, cierre de períodos, rectificación auditada ni exportación PDF/Excel.
- El administrador puede crear ciclos lectivos y períodos desde Configuración > Calendario académico; todavía no puede editar ni eliminar períodos desde la interfaz, ni administrar escalas de calificación.
- No se ha validado con cuentas autenticadas reales; el proyecto sigue sin membresías activas.
- No se ha ejecutado lint, TypeScript ni build en este entorno; los checks de GitHub consultados no reportaron ejecuciones asociadas al commit.

## Pruebas antes de producción

1. Administrador crea evaluación en una división y período válidos.
2. Docente asignado crea evaluación y registra notas.
3. Docente no asignado no puede crear ni modificar.
4. Director consulta notas, pero no modifica.
5. Alumno consulta solo sus propias notas.
6. Tutor consulta únicamente alumnos vinculados y con `can_view_grades`.
7. Un usuario no vinculado no obtiene notas.
8. Se rechazan puntajes negativos, mayores al máximo, materias de otro curso y períodos de otro ciclo lectivo.
9. Un alumno de otra división o institución no puede recibir una nota en la evaluación.
10. Repetir guardado actualiza la misma fila, sin duplicar registros.
