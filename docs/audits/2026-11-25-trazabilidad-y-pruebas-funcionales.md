# Auditoría de trazabilidad y pruebas funcionales EDUNEXA
Fecha de verificación: 2026-11-25
Rama auditada: `feature/EDUNEXA-MODELES`
HEAD: `9e831ad3bf262d97a5f0d3c7085945369c175c03`

## Alcance y límites
Esta revisión es de solo lectura sobre Supabase y Render. No modifica datos ni vuelve a aplicar migraciones. No se consultaron ni expusieron valores de GitHub Secrets.

## Migraciones históricas sin fuente recuperable
El registro remoto de Supabase contiene estas migraciones, pero el árbol actual de la rama no contiene sus archivos SQL y la API de historial de commits consultada por cada ruta devolvió cero commits:

| Versión registrada | Nombre en ledger |
|---|---|
| `20261122033846` | `import_students_with_enrollments` |
| `20261122033848` | `enforce_case_insensitive_student_numbers` |
| `20261122033850` | `align_enrollment_dates_to_argentina_timezone` |

No se recuperó el SQL original desde Git. El catálogo actual permite observar parte del estado resultante, pero no reconstruir fielmente las sentencias, condiciones, orden, grants, comentarios y decisiones de implementación originales. Por ejemplo, existe `public.import_students_with_enrollments`, que delega en `private.import_students_with_enrollments_impl`; la restricción actual de `students` es `UNIQUE (institution_id, student_number)`, y `enrollments` tiene el check `ended_on IS NULL OR ended_on >= enrolled_on`. Estos objetos no constituyen el contenido original de las migraciones.

**Decisión:** no crear archivos SQL sustitutos ni editar el ledger remoto. Para cerrar la trazabilidad se necesita un respaldo del repositorio/commit original o un artefacto de despliegue que contenga esos tres archivos exactos, con hashes verificables.

## CI y pruebas por perfil
La ejecución `45533798393`, asociada al HEAD auditado, terminó `success`:
- `validate`: success (dependencias, lint, TypeScript, validaciones estáticas, build y smoke tests públicos).
- `guardian-progress-postgres`: success (pruebas aisladas PostgreSQL de progreso del tutor y autorización por roles).
- `role-login-modules-e2e`: skipped.
- `student-notifications-e2e`: skipped.

El workflow condiciona `role-login-modules-e2e` a `workflow_dispatch` y a la variable `ENABLE_ROLE_LOGIN_E2E=true`. Antes de iniciar Playwright exige URL base, institución y credenciales sintéticas de ocho perfiles: administrador institucional, directivo, administrativo, preceptor, Secretaría (subperfil directivo), docente, alumno y tutor. El workflow contiene comprobación explícita de variables vacías. No se leyó ningún secreto y no se afirma que estén configurados o ausentes.

El spec existente valida autenticación y acceso a espacios/rutas. No realiza escrituras transaccionales de asistencia, citaciones, mensajes, aulas, entregas, boletines, calendario o soporte. Por ello, incluso una ejecución exitosa del spec actual no certificaría esos flujos de extremo a extremo.

## Estado de datos observado (solo conteos)
| Área | Filas |
|---|---:|
| Asistencia de Preceptoría | 0 |
| Novedades de Preceptoría | 0 |
| Citaciones docente-familia | 0 |
| Aulas virtuales | 1 |
| Actividades/tareas | 1 |
| Entregas | 0 |
| Flujos de boletines | 4 |
| Eventos de calendario académico | 0 |
| Conversaciones | 0 |
| Tickets de soporte | 0 |

Los conteos demuestran presencia o ausencia de registros, no que las operaciones de escritura/lectura estén funcionando. En particular, asistencia, citaciones, mensajería, entregas, calendario y soporte siguen sin evidencia transaccional en esta auditoría.

## Render
El servicio `srv-dc2vhct9el5s73cvvm9g` está asociado a la rama `feature/EDUNEXA-MODELES`, con auto-deploy desactivado. El último deploy LIVE observado usa el commit `b00383671d48c827df73777032c01237bba5b089`. El código de aplicación de ese deploy no incorpora los commits posteriores que solo tocaron CI, E2E, funciones Edge y migraciones SQL; por tanto no se solicitó un redeploy de aplicación durante esta revisión.

## Matriz pendiente para pruebas transaccionales
Ejecutar con fixtures sintéticos aislados y verificar tanto resultado RPC/UI como persistencia, auditoría, alcance institucional y denegaciones cruzadas:

1. Preceptoría: abrir sesión, registrar presente/ausente/media falta, editar observación, cerrar sesión; verificar duplicados, responsable y división no asignada.
2. Citaciones: crear, listar por destinatario, responder/confirmar y verificar que un perfil ajeno no pueda leer ni modificar.
3. Mensajería: crear conversación autorizada por vínculo/materia, enviar y leer mensajes; comprobar denegación entre instituciones y relaciones no autorizadas.
4. Aulas: crear/configurar aula, invitar o asociar alumno, publicar material y tarea; validar titularidad y permisos auxiliares.
5. Entregas: alumno entrega/adjunta/revisa borrador; docente revisa, califica y devuelve; verificar historial, archivos privados, puntaje máximo y estado.
6. Boletines: completar calificaciones, cerrar período, generar snapshot, aprobar/publicar con audiencia; comprobar inmutabilidad y lectura según audiencia.
7. Calendario: crear evento por directivo, asignar audiencia, listar desde perfiles autorizados y denegar audiencia ajena.
8. Soporte: crear ticket, adjuntar contexto, responder/cerrar; verificar timestamps, primera respuesta, institución y bloqueo de respuestas al cerrar.

Cada caso debe usar identificadores sintéticos, guardar evidencia de antes/después y limpiar solo los datos creados por la propia prueba. No usar datos reales de alumnos.

## Conclusión
CI y validaciones estáticas/aisladas están aprobadas, pero la auditoría transaccional por los ocho perfiles no está cerrada. Las tres migraciones históricas permanecen sin fuente original recuperable. No se modificó el esquema ni los datos de producción durante esta revisión.
