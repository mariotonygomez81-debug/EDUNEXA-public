# Preparar Supabase local gratuito para auditar el esquema fundacional

Estado: procedimiento preparado; **no ejecutado** en esta sesión.
Alcance: iniciar PostgreSQL local aislado y consultar metadatos de catálogo. No crea migraciones ni DDL de aplicación.

## 1. Qué se encontró antes de preparar el entorno

Se localizó el repositorio upstream privado original. Su rama principal contiene 135 migraciones, pero no contiene un dump de esquema, `schema.sql`, backup ni baseline que cree el núcleo institucional. La auditoría histórica del upstream reconoce que la primera secuencia académica fue recuperada desde el historial de migraciones de Supabase y que faltaba reproducir el esquema completo en una base limpia.

El upstream contiene estas piezas versionadas:

- `20261120024755_academic_core_and_learning_modules.sql`: crea tablas académicas, familiares y de aula, pero referencia `public.institutions`, `public.campuses` y `public.memberships` que ya deben existir.
- `20261120024857_secure_sensitive_tables_and_fk_indexes.sql`: aplica políticas e índices sobre tablas existentes.
- `20261120030658_create_private_permission_helpers.sql`: crea el esquema `private` y helpers que consultan membresías, roles y permisos ya existentes.
- `20261120031255_create_profile_on_auth_user.sql`: crea trigger y función que insertan en `public.profiles`, pero no crea la tabla `profiles`.

Por tanto, ejecutar las migraciones actuales en una instalación vacía no sustituye el baseline ausente y probablemente falle al resolver las primeras FK. No ejecutar el reset del repositorio completo hasta recuperar el baseline.

## 2. Requisitos gratuitos

- Windows 10/11, macOS o Linux.
- Docker Desktop o runtime compatible con la API Docker, iniciado localmente.
- Supabase CLI v3 (la rama v3 usa local por defecto; comprobar versión y ayuda antes de ejecutar).
- `psql` disponible, o usar el cliente `psql` dentro del contenedor local.
- Espacio de disco suficiente para imágenes Docker. Supabase recomienda al menos 7 GB de RAM para el stack completo; este procedimiento inicia sólo PostgreSQL.

No instalar dependencias dentro del `package.json` de EDUNEXA. No hace falta contratar Supabase, crear branches alojados ni iniciar sesión en la nube.

## 3. Crear un proyecto temporal aislado (PowerShell)

Abrir PowerShell. Este procedimiento crea una carpeta temporal fuera del repositorio EDUNEXA, con un ID local distinto y sin migraciones:

```powershell
$Audit = Join-Path $env:TEMP "edunexa-foundation-audit"
New-Item -ItemType Directory -Force "$Audit\supabase\migrations" | Out-Null

@'
project_id = "edunexa-foundation-audit"

[db]
port = 54322
'@ | Set-Content -Encoding utf8 "$Audit\supabase\config.toml"

Set-Location $Audit
```

Comprobar las herramientas antes de iniciar:

```powershell
docker version
supabase --version
supabase db start --help
```

Si la CLI no está instalada, instalarla siguiendo la documentación oficial, sin añadirla como dependencia del proyecto EDUNEXA.

## 4. Iniciar sólo PostgreSQL local

Ejecutar desde la carpeta temporal:

```powershell
supabase db start
supabase status
```

`supabase db start` inicia PostgreSQL local. No utilizar `supabase start` para esta fase, porque se requiere únicamente la base de datos. La carpeta temporal tiene una carpeta de migraciones vacía y no contiene seed.

Conectar al Postgres local (puerto por defecto):

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Si `psql` no está en PATH, abrir una terminal en el contenedor local de PostgreSQL y ejecutar allí el archivo de inspección.

## 5. Inspeccionar el catálogo sin modificarlo

Desde otra consola PowerShell, con la carpeta temporal como directorio actual, ejecutar el script versionado de consultas de solo lectura:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -v ON_ERROR_STOP=1 -f "<RUTA-DEL-REPO>\docs\database\local-foundation-catalog.readonly.sql"
```

El archivo contiene únicamente consultas `SELECT` a catálogos PostgreSQL: tablas y RLS, columnas, constraints, índices, políticas, triggers, rutinas, grants y extensiones. No lee filas de alumnos, tutores, docentes ni usuarios; no contiene DDL ni DML.

En esta primera ejecución, al no haber cargado un esquema de aplicación, el resultado esperado es que no aparezcan las ocho tablas fundacionales ni las tablas académicas. Esto verifica que la instancia local está aislada y sirve como destino temporal; **no prueba todavía la equivalencia del esquema EDUNEXA**.

## 6. Qué no ejecutar

Durante esta fase queda expresamente prohibido:

- `supabase link`, `supabase login`, `supabase projects`.
- `supabase db pull`, `supabase db push`, `supabase db dump`, `supabase db diff`.
- `supabase db reset`, `supabase migration repair`, `supabase migration list --remote`.
- Cualquier comando con `--remote`, `--linked`, `--db-url` o un project ref alojado.
- Copiar al proyecto temporal el `project_id` del Supabase alojado.
- Ejecutar migraciones históricas, seeds o scripts de bootstrap en esta etapa.
- Copiar backups con datos, credenciales, archivos de menores o secretos.

La CLI v3 cambió los destinos predeterminados y eliminó/renombró flags antiguos. Aun cuando v3 es local por defecto, este procedimiento evita deliberadamente comandos de migración y enlace. Revisar siempre `supabase <comando> --help` antes de cualquier futura operación.

## 7. Detener el entorno

Cuando termine la inspección:

```powershell
supabase stop
```

No utilizar `--all` ni `--no-backup`. El directorio temporal puede conservarse para repetir la inspección o eliminarse manualmente cuando PostgreSQL esté detenido.

## 8. Validación real del esquema: condición pendiente

Para contrastar las ocho tablas fundacionales y el resto del esquema hace falta recuperar una fuente de esquema **sin filas** y con procedencia verificable, o un baseline histórico original aprobado.

Cuando esa fuente exista:

1. Revisar el archivo fuera de línea y confirmar que es schema-only, sin `COPY`, `INSERT`, datos de Auth, datos académicos, secretos ni storage objects.
2. Verificar versión de PostgreSQL y extensiones requeridas.
3. Usar una instancia temporal nueva, distinta de cualquier volumen con información previa.
4. Sólo con autorización explícita, restaurar esa fuente autoritativa en el Postgres local temporal. Esto ejecutaría el DDL de la fuente aprobada únicamente en local; no se escribiría una migración nueva.
5. Ejecutar de nuevo el script de catálogo y comparar tablas, columnas, constraints, índices, políticas, RLS, triggers, rutinas, grants y extensiones con el inventario del upstream.
6. Mantener bloqueada la creación de una migración baseline hasta completar la comparación y la revisión.

Hasta que se recupere y apruebe esa fuente, la inspección local sólo valida la infraestructura y el inventario documental. No se autoriza fabricar DDL a partir de tipos TypeScript o conteos de auditoría.

## 9. Referencias oficiales

- Supabase CLI local: https://supabase.com/docs/guides/local-development/cli/getting-started
- Supabase CLI v3 y cambios de destino local/remoto: https://supabase.com/docs/guides/local-development/cli/migrating-to-v3
- Comando `supabase db start`: https://supabase.com/docs/reference/cli/introduction

