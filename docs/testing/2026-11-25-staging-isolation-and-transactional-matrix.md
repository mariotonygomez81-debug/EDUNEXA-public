# EDUNEXA — Diseño de aislamiento de staging y matriz transaccional
Fecha: 2026-11-25
Rama de trabajo: `feature/EDUNEXA-MODELES`
Estado: diseño preparado; no desplegado ni ejecutado contra producción.

## 1. Decisión de aislamiento

No ejecutar pruebas de escritura contra el proyecto Supabase de producción `fafsrqhygrrllfjfgtvh` ni contra el servicio Render LIVE `srv-dc2vhct9el5s73cvvm9g`.

La organización Supabase actual `GNOSIS GROUP` está en plan Free. La cotización de Branching es USD 0.01344/hora para compute Micro; Supabase documenta que Branching requiere Pro y que los cargos de Branching no reciben Compute Credits ni Spend Cap. El costo base estimado es Pro USD 25/mes + rama Micro USD 9.68 por 30 días (720 h) o USD 9.81 por 730 h, antes de egress/storage/otros consumos. No se habilita ni crea nada sin aprobación del titular.

## 2. Topología propuesta

```text
GitHub feature/EDUNEXA-MODELES
       |
       +-- CI estático + PostgreSQL efímero (sin secretos)
       |
       +-- workflow_dispatch: staging-e2e
                    |
                    +-- Supabase staging branch (schema aislado, sin filas productivas)
                    |      - URL / publishable key propias
                    |      - Auth users sintéticos
                    |      - Storage buckets vacíos
                    |      - Edge Functions de staging
                    |
                    +-- Render staging service (servicio nuevo e independiente)
                           - URL staging propia
                           - env vars exclusivas de staging
                           - sin credenciales de producción
```

### Supabase staging
- Crear solo después de aprobación explícita del costo y plan Pro.
- Preferir una rama creada desde el Dashboard a partir del estado de producción, sin incluir datos, porque el historial de migraciones de producción contiene tres migraciones sin fuente recuperada en Git. No fingir que los archivos faltantes fueron reconstruidos.
- No usar opciones de copiar/importar datos. Verificar que tablas de negocio y Storage estén vacíos antes de sembrar fixtures.
- Revisar el esquema de la rama frente al código de `feature/EDUNEXA-MODELES`; aplicar en staging únicamente cambios versionados y revisados. No hacer merge de la rama a producción.
- Crear usuarios y relaciones sintéticas con identificadores propios de staging. No copiar usuarios, emails, teléfonos, documentos ni datos de estudiantes reales.
- Reconfigurar secretos OAuth/SMTP/servicios externos con valores de prueba o deshabilitarlos.
- Usar URL y publishable key de la rama. El service-role key, si fuera imprescindible para bootstrap, solo como GitHub Environment secret y solo en pasos backend de staging; nunca NEXT_PUBLIC ni logs.

### Render staging
- Crear un servicio web separado, conectado al mismo repositorio y exclusivamente a `feature/EDUNEXA-MODELES`.
- Mantener intactos el servicio actual `edunexa`, su ID, dominio y configuración.
- Asignar subdominio de staging distinto y configurar variables Supabase de staging, Groq de staging (o mock para pruebas) y flags de entorno.
- Desactivar auto-deploy inicialmente; desplegar manualmente el SHA auditado después de validar el build.
- Prohibir fallback a URL, claves o datos de producción. Verificar en logs y health checks que el servicio habla únicamente con el proyecto staging.

### GitHub Actions
- Mantener CI existente sin secretos para lint, typecheck, build y suites PostgreSQL efímeras.
- Añadir un GitHub Environment `edunexa-staging` con protección/revisión manual.
- Guardar variables no sensibles: `EDUNEXA_E2E_BASE_URL`, `E2E_INSTITUTION_SLUG`, `SUPABASE_STAGING_URL`.
- Guardar secretos exclusivos de staging: publishable key si se requiere como secreto, credenciales sintéticas de ocho perfiles y, solo para bootstrap backend, service-role key de staging.
- Nunca reutilizar `E2E_*` ni claves del proyecto productivo.
- Ejecutar solo mediante `workflow_dispatch` desde `feature/EDUNEXA-MODELES`, validar presencia de configuración sin imprimir valores y comprobar que URL/Project Ref corresponden a staging antes de Playwright.
- Conservar reportes, screenshots y trazas sin tokens, cookies, contraseñas ni datos personales.
- No activar E2E por push ni desde pull requests externos.

## 3. Preparación de fixtures

Crear una institución sintética `edunexa-staging-demo`, períodos y divisiones de prueba, materias, una aula, asignaciones y un conjunto mínimo de estudiantes ficticios. Crear ocho perfiles lógicos:
1. Administrador institucional.
2. Directivo.
3. Administrativo.
4. Preceptor.
5. Secretaría (subperfil de Director; no crear rol independiente).
6. Docente.
7. Alumno.
8. Tutor vinculado únicamente al alumno sintético.

Todas las filas deben llevar un identificador de ejecución (por ejemplo, UUID `test_run_id`) o un prefijo inequívoco en los campos disponibles. El cleanup debe borrar solo los IDs creados por esa ejecución, en orden FK, y nunca truncar tablas ni ejecutar resets contra producción.

## 4. Matriz transaccional por perfil

| Perfil | Flujos permitidos a probar | Denegaciones obligatorias |
|---|---|---|
| Administrador institucional | Configurar institución/divisiones, asignaciones, usuarios y permisos; consultar auditoría | No acceder a otra institución |
| Directivo | Calendario, boletines, audiencias, lectura de asistencia e informes; autorizaciones según rol | No ejecutar acciones exclusivas del administrador institucional |
| Administrativo | Consultas y operaciones administrativas de alumnos/documentación autorizadas | No calificar, publicar boletines ni alterar asistencia si no tiene permiso |
| Preceptor | Abrir sesión de asistencia, marcar presente/ausente/media falta, nota, editar/cerrar; novedades y citaciones | No modificar divisiones no asignadas ni sesiones de otro responsable |
| Secretaría (subperfil) | Lecturas y gestiones de alumnos/documentos permitidas por subperfil | No recibir permisos implícitos de director ni rol independiente |
| Docente | Aula, materiales, actividades, citas a familias, revisión y calificación de entregas, notas | No ver aulas/alumnos fuera de asignación |
| Alumno | Consultar aula, entregar/revisar borrador, adjuntar archivo, ver devolución y boletín publicado | No ver entregas de otros alumnos ni borradores privados ajenos |
| Tutor | Ver progreso, boletines y comunicaciones del alumno vinculado; responder citaciones y mensajes autorizados | No consultar otro alumno ni iniciar conversaciones fuera del vínculo |

## 5. Casos transaccionales obligatorios

### A. Asistencia de Preceptoría
1. Preceptor asignado abre sesión para fecha/división.
2. Registra presente, ausente y media falta para alumnos sintéticos.
3. Guarda y vuelve a consultar desde una sesión nueva.
4. Edita una marca y su observación; cierra la sesión.
5. Repite request para comprobar idempotencia/duplicado.
6. Preceptor no asignado intenta leer y escribir: debe ser denegado.
7. Verificar responsable, división, timestamps, estado de sesión y persistencia.

### B. Citaciones
1. Docente o Preceptor autorizado crea citación para tutor vinculado.
2. Tutor consulta solo la citación de su alumno y confirma/responde.
3. Actor autorizado consulta estado actualizado.
4. Tutor no vinculado y docente de otra división intentan acceso: denegado.
5. Verificar historial, audiencia y persistencia.

### C. Mensajería
1. Crear conversación con una relación permitida (familia/alumno/docente según reglas vigentes).
2. Enviar dos mensajes y leerlos desde el otro participante.
3. Probar la materia previa con el helper y etiqueta correspondiente.
4. Usuario sin relación, institución distinta o participante removido intenta leer/enviar: denegado.
5. Verificar miembros, mensajes, orden y etiqueta.

### D. Aulas
1. Docente titular crea/configura aula y agrega colaborador autorizado.
2. Publica material y actividad; alumno matriculado los ve.
3. Docente no asignado y alumno de otra división no acceden.
4. Verificar capacidades, titularidad y relaciones persistidas.

### E. Entregas
1. Alumno crea borrador, agrega adjunto privado y lo finaliza.
2. Docente asignado ve entrega, solicita revisión, califica dentro del máximo y devuelve.
3. Alumno ve devolución e historial propio.
4. Intentar puntaje mayor al máximo, leer archivo de otro alumno o modificar historial: denegado.
5. Verificar attachment metadata, storage privado, historial y review_status.

### F. Boletines
1. Docente autorizado registra/actualiza calificaciones en período abierto.
2. Directivo cierra período y genera snapshot inmutable.
3. Aprobador publica con audiencia explícita.
4. Alumno/tutor autorizados consultan; otro tutor no ve el snapshot.
5. Intentar cambiar calificaciones o snapshot publicado: denegado o nueva versión auditada según contrato.
6. Verificar workflow, versión, audiencia y snapshot.

### G. Calendario
1. Directivo crea evento y define audiencia por institución/división.
2. Docente, alumno y tutor consultan según audiencia.
3. Actor sin alcance intenta listar/leer/modificar: denegado.
4. Verificar fechas, timezone Argentina, audience y persistencia.

### H. Soporte
1. Administrativo crea ticket con contexto sintético.
2. Responsable autorizado responde; se registra primera respuesta.
3. Se cierra el ticket; intento posterior de respuesta debe fallar.
4. Otra institución o usuario no autorizado intenta leer/adjuntar: denegado.
5. Verificar lifecycle timestamps, adjuntos privados y aislamiento institucional.

## 6. Criterios de aprobación
Un flujo solo se marca APROBADO si:
- UI/API devuelve resultado esperado.
- RPC/tabla refleja el cambio tras nueva sesión/conexión.
- RLS y funciones rechazan acceso cruzado.
- Storage respeta privacidad y ownership.
- La auditoría conserva actor, institución, timestamps y estado.
- Cleanup elimina solo datos del test.
- La evidencia identifica SHA, run ID, test case y resultado sin exponer secretos.

Un 200 de ruta, build exitoso, existencia de RPC o conteo de filas no acredita una transacción completa.

## 7. Orden de ejecución
1. Aprobación explícita de costos y plan Pro.
2. Crear rama Supabase vacía de datos productivos y verificar aislamiento.
3. Preparar Render staging independiente y validar destino Supabase.
4. Crear GitHub Environment y credenciales sintéticas.
5. Ejecutar primero login/roles; luego cada transacción en orden A-H.
6. Corregir solo en `feature/EDUNEXA-MODELES`, repetir suite afectada y suite completa.
7. Mantener resultados como no aprobados hasta obtener evidencia completa.
8. Eliminar o pausar recursos de staging al terminar según la política de costos; no mergear ni promover a producción sin autorización separada.

## 8. Estado
Diseño documental preparado. No se creó rama Supabase, proyecto Render, GitHub Environment, secreto, usuario ni registro de prueba. No se accedió a credenciales reales y no se ejecutó ninguna escritura en producción.
