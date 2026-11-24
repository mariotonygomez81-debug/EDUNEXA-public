# Validación PostgreSQL aislada del seguimiento académico del Tutor

Este procedimiento valida el borrador `docs/database/guardian-assignment-progress.draft.sql` en PostgreSQL 16 con datos completamente sintéticos. No requiere cuenta Supabase, proyecto Supabase, rama paga, Render ni secretos.

## Requisitos

- Docker Desktop o Docker Engine en ejecución.
- Git y el repositorio EDUNEXA clonado.
- Estar en la rama `feature/tutor-module`.

No hace falta instalar `psql`: el cliente se ejecuta dentro del contenedor temporal.

## Ejecutar la prueba

Desde la raíz del repositorio:

```bash
bash scripts/test-guardian-assignment-progress-postgres.sh
```

Opcionalmente, cambiar el puerto local si el 55439 está ocupado:

```bash
EDUNEXA_PG_PORT=55440 bash scripts/test-guardian-assignment-progress-postgres.sh
```

El script tiene dos modos:
- **CI:** si existe `DATABASE_URL`, usa un servicio PostgreSQL 16 aislado que GitHub Actions levanta para ese job.
- **Local:** si no existe `DATABASE_URL`, inicia un contenedor temporal `postgres:16-alpine` mediante Docker.

En ambos modos:
1. Crea un esquema mínimo fiel a las columnas utilizadas por el RPC.
2. Inserta únicamente usuarios, tutores, alumnos, materias, tareas y entregas ficticias.
3. Carga el SQL borrador.
4. Comprueba autorización por hijo, membresía activa, matrícula activa, estados de entrega, publicación de tareas y ocultamiento de calificaciones.
5. Verifica que la definición de retorno no incluya cuerpo, devolución ni ruta de archivos.
6. En modo local, elimina el contenedor al finalizar, incluso si falla.

La prueba simula `auth.uid()` y `private.has_institution_permission()` con funciones de fixture. Por ello valida sintaxis PostgreSQL y las reglas internas de esta RPC, pero no sustituye una prueba completa de Supabase Auth, RLS, PostgREST ni la implementación real de permisos.

## Permisos y esquema revisados

La implementación real se revisó en las migraciones fuente:

- `private.has_institution_permission(institution_id, permission_key)` obtiene permisos mediante `memberships`, `membership_roles`, `role_permissions` y `permissions`; exige `auth.uid()` y membresía activa.
- `classroom.read` está asignado al rol `guardian`. La última versión de `private.can_access_classroom` exige vínculo tutor-hijo y matrícula activa para permitir lectura.
- `private.can_access_student(student_id, institution_id, 'grades.read')` exige permiso institucional y `student_guardians.can_view_grades`. El RPC ahora usa este helper además del flag por hijo antes de exponer `score` o `max_score`.
- Las políticas de lectura de `assessments` y `grade_records` también usan `private.can_access_student(..., 'grades.read')`.
- El RPC interno es `SECURITY DEFINER`, por lo que no depende de RLS para filtrar las filas. Por eso replica de forma explícita el scope: usuario autenticado, rol guardian activo, permiso `classroom.read`, vínculo exacto del hijo, matrícula vigente, tarea publicada y filtro de calificaciones con el helper canónico. El wrapper público es `SECURITY INVOKER`, y las funciones privadas no son accesibles para `anon`.

El esquema de tareas usa calificación porcentual: `assignments.max_score` puede ser `100` o `NULL` (actividad formativa). El fixture se ajustó a esta escala. No se devuelve `instructions`, cuerpo de entrega, archivos, devolución docente ni eventos de auditoría.

La evolución histórica ya existente en el portal compara las últimas versiones de boletines oficiales publicados por materia y período. Ahora su cálculo y presentación quedan condicionados a `student.can_view_grades`; cuando el permiso falta, no se muestran porcentajes, tendencias ni señales de acompañamiento.

## Resultado esperado

```
Guardian assignment progress PostgreSQL checks passed.
PASS: isolated PostgreSQL validation completed. No Supabase project was contacted.
```

## Después de aprobar la prueba aislada

Cuando esté disponible Docker y Supabase CLI local, el siguiente paso seguro será:

```bash
supabase start
supabase migration new guardian_assignment_progress
```

Copiar el contenido revisado del borrador a la migración recién creada y ejecutar:

```bash
supabase db reset
```

Esto aplica las migraciones al entorno Supabase local iniciado por Docker. Revisar también la función real `private.has_institution_permission`, las políticas RLS y los permisos de esquema. No ejecutar `supabase db push`, no vincular el proyecto productivo y no usar `--linked`.

La migración no debe considerarse lista hasta pasar el reset local completo y una prueba de acceso autenticada en Supabase local. Este documento no autoriza aplicar cambios en producción.
