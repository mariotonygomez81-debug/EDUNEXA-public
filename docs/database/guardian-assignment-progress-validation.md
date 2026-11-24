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
