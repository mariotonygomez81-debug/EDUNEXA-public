# Guía de pruebas integrales — Superadministrador EDUNEXA

## Alcance y seguridad

Esta guía valida el control global con dos Superadministradores independientes y dos instituciones sintéticas. Debe ejecutarse en un entorno de pruebas aislado, nunca con alumnos ni datos reales.

- Rama de código: feature/EDUNEXA-MODELES.
- Proveedor de IA: exclusivamente Groq.
- No aplicar estas migraciones al Supabase alojado de producción ni modificar Render sin autorización explícita.
- No usar user_metadata para conceder privilegios; el rol global debe estar en app_metadata.platform_role.
- Las cuentas de prueba deben ser distintas y tener MFA si el entorno lo permite.
- No copiar contraseñas, documentos, teléfonos ni correos reales a las instituciones clonadas.

## Preparación

Crear en un Supabase de pruebas aislado:

1. SA-A: Superadministrador que solicita operaciones.
2. SA-B: Superadministrador independiente que aprueba.
3. Institución A: Colegio Sintético Uno.
4. Institución B: Colegio Sintético Dos, con idioma/zona horaria y sede diferentes.

En A configurar:
- Idioma es-AR y zona horaria America/Argentina/Buenos_Aires.
- Sede Central, código CENTRAL, marcada como principal.
- Un ciclo lectivo, un período, una escala con niveles, un nivel educativo, un curso, una materia y una división asignada a la sede.
- Una relación curso-materia.

En B configurar una sede distinta, código DOS, e idioma es-UY con zona America/Montevideo. No reutilizar los identificadores de A.

Para comprobar exclusión de datos de contacto, cargar únicamente valores ficticios en domicilio y teléfono de las sedes. No cargar alumnos, tutores, membresías, legajos ni calificaciones.

## Matriz de pruebas

### 1. Identidad y separación de Superadministradores

1. Iniciar sesión como SA-A y solicitar una delegación o clonación.
2. Intentar aprobar la misma solicitud desde SA-A.
3. Confirmar que se rechaza por aprobación independiente.
4. Iniciar sesión como SA-B y aprobar.
5. Confirmar que el registro conserva requested_by y approved_by distintos.
6. Intentar acceder como usuario institucional sin app_metadata.platform_role=superadmin; debe denegarse aunque user_metadata contenga ese texto.

Resultado esperado: ninguna persona aprueba su propia operación; los claims editables por el usuario no elevan privilegios.

### 2. Aislamiento de las dos instituciones

1. Abrir A y verificar Sede Central y sus parámetros académicos.
2. Abrir B y verificar Sede Exclusiva Dos y sus parámetros distintos.
3. Comprobar que el registro privado contiene una instantánea por institución.
4. Verificar que A no contiene el nombre ni los parámetros de B y viceversa.

Resultado esperado: cada lectura y cada configuración están ligadas a su institution_id; ningún identificador o ajuste se comparte entre tenants.

### 3. Clonación configuration-only

1. Como SA-A solicitar clonar A con un nuevo nombre y slug.
2. Como SA-A intentar aprobar; debe rechazarse.
3. Como SA-B aprobar el trabajo.
4. Esperar que el trabajador lo reclame y finalice.
5. Abrir la institución destino, que debe quedar pendiente de activación.
6. Verificar idioma, zona horaria, calendario, períodos, escalas, niveles, cursos, materias, relaciones curso-materia y divisiones.
7. Verificar que la sede clonada conserva nombre, código e indicador de sede principal.
8. Verificar que la división clonada apunta al ID de la sede nueva, no al ID de A.
9. Confirmar que domicilio y teléfono de la sede clonada están vacíos.
10. Confirmar que no hay membresías, alumnos, tutores, matrículas, notas, asistencias ni mensajes copiados.
11. Confirmar que no aparece la sede ni el perfil de B en el destino clonado desde A.

Resultado esperado: solo se copian campos de configuración allowlisted; se regeneran identificadores y se mantiene la institución destino pendiente.

### 4. Recuperación del trabajador

En el entorno de pruebas, simular un fallo transitorio del trabajador antes de materializar la configuración:

1. Confirmar que el trabajo aprobado pasa de queued a running.
2. Provocar una respuesta de fallo transitorio controlada.
3. Verificar que el trabajo vuelve a queued si no agotó los tres intentos.
4. Volver a reclamar el trabajo.
5. Completarlo y verificar que solo existe un conjunto de configuración materializado.
6. Revisar attempt_count, last_error_code, completed_at y eventos de auditoría.

Resultado esperado: no se duplican filas ni se deja una institución parcialmente clonada. Si la materialización falla, la transacción completa debe revertirse.

### 5. Acceso delegado de solo lectura en los siete módulos

Como SA-A solicitar una delegación para A, con motivo y vencimiento dentro de los 30 minutos. Seleccionar los siete módulos:

| Módulo | Configuración visible esperada |
|---|---|
| Docentes | Estructura académica |
| Preceptor | Estructura académica y calendario |
| Alumnos | Calendario y escalas |
| Tutor | Calendario |
| Directivos | Calendario, escalas y estructura |
| Administrativos | Estructura académica |
| Administrador | Perfil institucional, calendario, escalas, estructura y categorías de configuración admitidas |

Como SA-B aprobar la solicitud. Luego, como SA-A:

1. Entrar al colegio mediante el espacio de soporte delegado.
2. Abrir cada uno de los siete módulos y consultar la configuración.
3. Intentar crear, editar o eliminar una configuración.
4. Intentar consultar una categoría no autorizada.
5. Intentar cambiar la URL al slug de B.
6. Intentar leer matrículas, alumnos, tutores, legajos o datos personales.

Resultado esperado: lectura limitada al alcance aprobado, sin acciones de escritura, sin acceso a B y sin acceso a datos personales. Cada lectura debe generar un evento de auditoría.

### 6. Vencimiento y revocación

1. Crear una delegación breve (por ejemplo, dos minutos) y aprobarla con SA-B.
2. Verificar que funciona antes del vencimiento.
3. Esperar el vencimiento y volver a consultar; debe denegarse.
4. Crear otra delegación con vencimiento futuro.
5. Revocarla como SA-A.
6. Intentar volver a consultar inmediatamente; debe denegarse.
7. Comprobar que las delegaciones vencidas aparecen como expiradas y las revocadas como revocadas.

Resultado esperado: la expiración y la revocación se validan en el servidor en cada lectura; ocultar un botón en la interfaz no es suficiente.

### 7. Auditoría append-only

1. Revisar los eventos de solicitud, aprobación, lectura delegada, clonación, fallo/reintento y finalización.
2. Verificar actor, institución, motivo, request ID, resultado y metadatos reducidos.
3. Confirmar que cada lectura delegada tiene su evento propio.
4. Intentar modificar o borrar un evento de auditoría con roles de aplicación.

Resultado esperado: los eventos no se pueden modificar ni borrar; las operaciones de base de datos y su auditoría se confirman o revierten juntas. Las llamadas externas usan saga con compensación cuando corresponde.

## Evidencias a guardar

- IDs sintéticos de SA-A, SA-B, A, B y la institución clonada.
- ID de trabajo de clonación y sus intentos.
- ID de cada delegación, alcance y vencimiento.
- Capturas de los siete módulos en modo de solo lectura.
- Eventos de auditoría relevantes.
- Resultado del workflow CI y de las pruebas PostgreSQL efímeras.

No adjuntar tokens, claves API, credenciales, correos reales ni información de estudiantes.

## Criterios de aceptación

La etapa se considera aprobada manualmente solo si:
- SA-A y SA-B son identidades distintas y la doble aprobación se cumple.
- A, B y el destino clonado no mezclan datos.
- La clonación incluye sedes y parámetros institucionales seguros, con referencias remapeadas.
- Un fallo transitorio permite recuperación sin duplicación ni estado parcial.
- Los siete módulos devuelven únicamente las categorías permitidas y no permiten escrituras.
- Expiración y revocación cortan el acceso inmediatamente.
- La auditoría es completa y append-only.

La CI automatizada valida el contrato y datos sintéticos en PostgreSQL efímero; no sustituye esta prueba manual ni certifica el proyecto Supabase alojado.
