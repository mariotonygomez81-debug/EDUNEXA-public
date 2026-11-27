# Decisión de arquitectura 0003: mesa de ayuda y escalamiento de soporte

- Estado: Aceptada
- Fecha: 2026-11-20
- Alcance: soporte funcional y técnico dentro de cada instalación escolar y soporte global PIE

## Objetivo

Cualquier usuario autenticado de una instalación escolar podrá reportar un error o solicitar ayuda mediante un ticket. La primera línea de atención será el administrador institucional. Si este no puede resolver el caso, podrá escalarlo al superadministrador PIE.

## Flujo de atención

1. **Apertura por el usuario:** desde la plataforma, cualquier rol escolar puede crear un ticket. Debe indicar un título, descripción, módulo afectado y categoría; puede agregar pasos para reproducir el problema, fecha/hora aproximada y capturas o archivos no sensibles.
2. **Recepción institucional:** el ticket ingresa a la bandeja de soporte del colegio. El/los usuarios con rol `institution_admin` pueden asignarlo, priorizarlo, pedir información, responder, marcarlo en análisis o resolverlo.
3. **Seguimiento:** el usuario que lo abrió puede consultar el estado, responder y adjuntar información. Por defecto solo ve sus propios tickets y los tickets en los que fue incorporado explícitamente como participante. El administrador institucional puede consultar todos los tickets de su instalación.
4. **Escalamiento:** si el administrador no puede resolverlo, utiliza una acción explícita «Escalar a soporte PIE». Debe registrar el motivo del escalamiento y preparar un resumen técnico. El ticket pasa a soporte global y recibe un identificador de caso de soporte.
5. **Resolución global:** el superadministrador PIE analiza el caso, solicita información adicional por el canal del ticket y propone/aplica una solución. Si requiere un cambio de código, el cambio se realiza en el repositorio exclusivo de esa instalación y se despliega solo allí, siguiendo CI, revisión, respaldo y control de versiones.
6. **Cierre:** el administrador institucional confirma la solución y comunica el cierre al usuario. El usuario puede reabrirlo durante un plazo configurable si el problema persiste. El cierre y la reapertura quedan registrados.

## Estados sugeridos

- `open`: nuevo, pendiente de revisión institucional.
- `triaged`: revisado y clasificado.
- `in_progress`: en análisis o resolución por el colegio.
- `waiting_user`: se necesita información del usuario.
- `escalated`: enviado a soporte PIE.
- `global_in_progress`: en atención por el superadministrador.
- `resolved`: solución informada.
- `closed`: confirmado/cerrado.
- `reopened`: reabierto por persistencia del problema.

Las transiciones se validarán en servidor. Un usuario común no puede asignar, escalar, cerrar administrativamente ni cambiar prioridad/estado fuera de las acciones permitidas.

## Datos del ticket

El modelo de la instalación escolar tendrá, como mínimo:

- Ticket: UUID, número legible local, título, descripción, categoría, módulo afectado, prioridad, estado, creador, responsable institucional, fechas de creación/actualización/cierre y referencia al caso global si fue escalado.
- Mensajes: autor, contenido, fecha y tipo (respuesta pública o nota interna institucional).
- Adjuntos: metadatos, autor y ruta privada en Storage. No permitir enlaces públicos; validar tamaño, tipo MIME, extensión y permisos. Evitar adjuntar datos personales de estudiantes salvo necesidad justificada.
- Historial de eventos: cambios de estado, prioridad, asignación, escalamiento, respuestas, adjuntos y cierre, con actor y fecha. El historial debe ser de solo inserción para usuarios de aplicación.
- Participantes: usuarios autorizados a seguir un ticket además de su creador y los administradores institucionales.

El esquema debe permitir una categoría configurable (por ejemplo: acceso, asistencia, calificaciones, aula virtual, comunicaciones, error visual, rendimiento u otro) sin acoplarse a nombres de módulos rígidos.

## Separación entre instalación escolar y control global

- El registro completo del ticket, conversaciones y adjuntos permanece en la base de datos y Storage del colegio.
- El plano de control PIE recibe únicamente los metadatos mínimos necesarios para gestionar el caso escalado: identificador global, identificador técnico de instalación, referencia local del ticket, categoría, prioridad, estado, fechas, responsable y un resumen técnico redactado para soporte.
- No copiar automáticamente mensajes completos, datos de alumnos, calificaciones, asistencias, archivos ni conversaciones privadas al plano global.
- El administrador institucional decide qué información técnica comparte al escalar. Debe revisar y redactar el resumen, retirar datos personales innecesarios y declarar el motivo.
- Si el diagnóstico requiere acceso temporal a la instalación, se emite una autorización de soporte limitada a ese ticket, con motivo, permisos concretos, vencimiento y auditoría. El superadministrador no recibe acceso permanente por el mero hecho de atender tickets.
- El acceso a archivos o registros sensibles requiere autorización específica, y debe quedar registrado quién accedió, qué consultó, cuándo y para qué.
- El superadministrador puede responder desde el panel global; la respuesta se entrega al ticket local mediante un canal autenticado entre servicios, con identidad de soporte y trazabilidad. No usar credenciales escolares compartidas ni exponer claves `service_role`.

## Seguridad y aislamiento

- RLS habilitado en todas las tablas de soporte de la instalación.
- El creador solo puede leer sus tickets y participar en sus conversaciones; no puede consultar tickets de otros usuarios.
- Los administradores institucionales pueden gestionar tickets de su instalación, no de otras.
- Las notas internas del colegio solo son visibles para administradores institucionales y personal de soporte autorizado; nunca para el usuario que abrió el ticket.
- Las notas internas globales solo son visibles en el plano de control PIE.
- Los adjuntos se guardan en un bucket privado por instalación, con URLs firmadas de corta duración y verificación de autorización en servidor.
- Validar cada operación en servidor; no confiar en IDs, roles, estados ni institución enviados por el navegador.
- Aplicar límites de frecuencia, protección contra spam, validación de archivos y controles contra contenido malicioso.
- No incluir contraseñas, tokens, claves API ni datos completos de menores en descripciones, capturas o registros.
- Auditar creación, lectura de adjuntos sensibles, cambios de estado, asignaciones, escalamiento, acceso de soporte y cierre.
- MFA obligatorio para administradores institucionales y superadministradores.

## Experiencia de usuario

- Acceso a «Ayuda y soporte» desde todos los módulos y perfiles.
- Formulario simple para informar el problema, con módulo y categoría detectados cuando sea posible.
- Número de ticket, estado visible, historial de respuestas y notificaciones dentro de la plataforma y por correo cuando el colegio configure el servicio.
- Bandejas diferenciadas: «Mis tickets», «Soporte del colegio» y, para el panel global, «Casos escalados».
- Indicadores de prioridad y antigüedad, filtros, búsqueda y métricas de tiempos de primera respuesta y resolución.
- Posibilidad de que el administrador institucional cree un ticket interno para sí mismo o escale un incidente técnico detectado por su equipo.

## Criterios de aceptación antes de producción

1. Un usuario de un colegio no puede leer, modificar ni descargar tickets de otro usuario, salvo participación explícita o rol institucional autorizado.
2. Un administrador solo puede gestionar tickets de su instalación.
3. Un ticket no escalado no aparece en el panel global PIE.
4. Al escalar, el control global recibe solo metadatos y resumen aprobados, sin adjuntos ni datos académicos por defecto.
5. La elevación de soporte tiene motivo, alcance y vencimiento; se revoca automáticamente al expirar o cerrar el caso.
6. Las notas internas no se muestran al usuario final.
7. Todas las transiciones y accesos privilegiados quedan auditados.
8. Se prueban permisos positivos y negativos con cuentas ficticias para cada rol antes de abrir RLS.
9. Los cambios de software se aplican solo al repositorio y despliegue del colegio afectado.

## Consecuencias

- El soporte se convierte en un flujo formal y trazable, no en una conversación informal fuera del sistema.
- El administrador institucional conserva la primera responsabilidad de atención y decide cuándo escalar.
- PIE puede atender problemas técnicos sin centralizar la información académica ni romper el aislamiento entre colegios.
- Se requieren dos componentes coordinados: módulo local de tickets y bandeja global de casos escalados, con integración autenticada y auditable.


## Estado de implementación (2026-11-20)

Se creó y aplicó en la instalación de referencia la migración `20261120034512_create_institution_support_ticket_foundation`, versionada en `supabase/migrations/20261120034512_create_institution_support_ticket_foundation.sql`.

Tablas creadas:
- `support_tickets`
- `support_ticket_messages`
- `support_ticket_attachments`
- `support_ticket_events`
- `support_ticket_escalations`

Verificación posterior:
- Las cinco tablas existen.
- RLS está habilitado en las cinco.
- Cada tabla tiene una política explícita `USING (false) WITH CHECK (false)` para `anon` y `authenticated`.
- El Security Advisor continúa sin hallazgos.
- Los privilegios de tabla de `authenticated` no incluyen TRUNCATE, REFERENCES ni TRIGGER.

**Alcance real:** esta entrega es únicamente la estructura de datos segura. Todavía no hay interfaz de tickets, políticas granulares, bucket privado de Storage, validación de archivos, notificaciones, integración con el plano global ni pruebas de flujo. Los tickets no están habilitados para usuarios finales.

Antes de habilitar acceso se deben completar:
1. Integridad entre `institution_id` y las membresías/autores del ticket, evitando referencias cruzadas entre colegios.
2. Políticas RLS positivas por creador, participante y administrador institucional; notas internas y escalamiento con reglas separadas.
3. Inmutabilidad del historial de eventos para usuarios de aplicación.
4. Bucket privado, límites y validación de adjuntos.
5. Acciones de servidor para crear, responder, asignar, priorizar, resolver y escalar, con transiciones verificadas.
6. Pruebas negativas y positivas por rol.


### Endurecimiento de integridad entre instituciones

Se aplicó y versionó la migración `20261120034727_enforce_institution_scope_for_support_tickets`. Las relaciones de creador, asignado, autor, responsable de adjuntos, actor de eventos y escalador ahora verifican la combinación `(membership_id, institution_id)`. Las relaciones entre tickets, mensajes, adjuntos, eventos y escalaciones también verifican `(record_id, institution_id)`. Esto evita que un registro de soporte de una instalación apunte accidentalmente a membresías o tickets de otra.

La consulta posterior confirmó las claves foráneas compuestas y el Security Advisor continuó sin hallazgos. Las políticas RLS siguen denegando acceso al cliente; no se abrió el módulo.


### Catálogo inicial de permisos de soporte

La migración `20261120034811_seed_support_ticket_permissions` incorporó:
- `support.create`: asignado a los siete roles escolares existentes, para permitir que cualquier perfil institucional pueda iniciar una solicitud.
- `support.read`, `support.manage` y `support.escalate`: asignados únicamente a `institution_admin` en esta etapa.

La asignación de permisos está en el catálogo de roles, pero las tablas de tickets siguen bloqueadas por RLS. Estos permisos no habilitan acceso por sí solos; se usarán al implementar y probar las políticas y acciones de servidor.


## Primera interfaz y permisos RLS (2026-11-20)

Se aplicó la migración `20261120035040_enable_scoped_school_ticket_access` y se versionó en `supabase/migrations/20261120035040_enable_scoped_school_ticket_access.sql`.

Acceso habilitado en esta etapa:
- Cada miembro activo con `support.create` puede crear un ticket con su propia membresía como creador.
- El creador puede consultar sus tickets y sus mensajes públicos.
- `institution_admin`, que tiene `support.read` y `support.manage`, puede consultar la bandeja institucional y responder.
- Los mensajes nuevos del cliente no pueden ser internos; la política exige `is_internal = false` y autoría de una membresía activa del mismo colegio.
- La interfaz está en `/dashboard/[slug]/support` y el detalle en `/dashboard/[slug]/support/[ticketId]`. El espacio institucional incluye el acceso a Ayuda y soporte.
- Las acciones de servidor verifican sesión, institución y membresía antes de insertar; RLS vuelve a validar la operación en PostgreSQL.

Se verificó el catálogo de permisos: `support.create` está asignado a los siete roles escolares; los permisos de lectura, gestión y escalamiento están asignados al administrador institucional.

Se mantienen cerrados:
- Adjuntos y Storage privado.
- Eventos/historial append-only.
- Notas internas.
- Escalamiento operativo al plano global PIE.
- Acceso de superadministración.

**Límite de pruebas:** el proyecto aún tiene cero membresías activas y cero perfiles. Por eso no se puede ejecutar una prueba positiva real del flujo autenticado hasta crear cuentas de prueba autorizadas. El Security Advisor no presenta hallazgos y las 42 tablas públicas continúan con RLS habilitado.


### Gestión del ticket y privilegios mínimos

Se agregó al detalle del ticket un panel exclusivo para `institution_admin`, que permite cambiar estado y prioridad. La acción de servidor valida sesión, instalación, membresía activa y rol institucional antes de actualizar; PostgreSQL vuelve a exigir `support.manage`.

Se aplicaron además dos migraciones de privilegios mínimos:
- `20261120035351_minimize_client_privileges_for_support_data`: los usuarios autenticados no pueden actualizar/eliminar mensajes ni operar sobre adjuntos, eventos y escalaciones. Para tickets solo se permite actualizar columnas de estado, prioridad y marcas temporales.
- `20261120035412_restrict_ticket_creation_columns`: la creación de tickets solo permite insertar institución, membresía creadora, título, descripción, módulo y categoría. Estado, prioridad, identificador y fechas quedan bajo defaults de la base.

Verificación posterior:
- `authenticated` conserva SELECT sobre tickets y SELECT/INSERT sobre mensajes.
- En tickets, INSERT quedó limitado a seis columnas; UPDATE quedó limitado a seis columnas de gestión.
- No aparecen grants de tabla a `anon`.
- Security Advisor: sin hallazgos.

La bandeja distingue el administrador institucional, que ve todos los tickets permitidos por RLS, del resto de perfiles, que solo ven sus propios tickets.


### Estado operativo verificado (2026-11-20, revisión posterior)

La interfaz local de tickets ya está versionada en:
- `src/app/dashboard/[slug]/support/page.tsx`
- `src/app/dashboard/[slug]/support/[ticketId]/page.tsx`
- `src/app/dashboard/[slug]/support/actions.ts`

La consulta actual de `pg_policies` confirma:
- Tickets: INSERT para miembros activos con `support.create`; SELECT para creador y administración autorizada; UPDATE para administración con `support.manage`.
- Mensajes: SELECT para creador sobre mensajes públicos y administración institucional; INSERT solo para el creador o administración, con `is_internal = false` y autoría activa del mismo colegio.
- Adjuntos, eventos y escalaciones: permanecen denegados al cliente.
- Los mensajes no pueden insertarse cuando el ticket está en estado `resolved` o `closed`, mediante la migración `20261120044211_prevent_replies_to_closed_support_tickets`.
- La acción de servidor aplica transiciones explícitas y actualizaciones condicionales sobre el estado previo. La interfaz oculta el formulario de respuesta para tickets resueltos/cerrados.

No existe todavía un bucket de Storage. No se habilitaron adjuntos, participantes adicionales, notas internas ni escalamiento global. Los estados `escalated` y `global_in_progress` no están disponibles en la interfaz ni en la acción de gestión hasta que exista el plano de control PIE.

La última ejecución CI observada, run 156, aprobó ESLint, TypeScript y build. Esto no sustituye pruebas positivas con cuentas autenticadas: la instalación todavía carece de perfiles/membresías de prueba. La matriz de aceptación operativa se registra en `docs/testing/support-rls-test-matrix.md`.
