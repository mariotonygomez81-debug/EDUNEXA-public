# Operaciones globales del Superadministrador EDUNEXA

## Estado de esta entrega

Esta especificación prepara la implementación, pero **no habilita operaciones privilegiadas**. No se crean endpoints mutadores, no se ejecutan cambios de Auth, no se modifican tablas, políticas, funciones, secretos ni servicios externos. La consola actual permanece de solo lectura/explicativa hasta que exista una auditoría persistente y verificable.

## Límites de autoridad

- Superadministrador: autorización global independiente de cualquier membresía institucional. La única señal aceptada para autorizar la consola es el claim confiable `app_metadata.platform_role = "superadmin"`, obtenido desde la sesión validada en el servidor.
- Administrador institucional: autoridad limitada a una membresía activa del colegio de la ruta y a los permisos de esa membresía. Nunca puede listar ni modificar otras instituciones ni elevarse a Superadministrador.
- Los claims de `user_metadata`, parámetros del navegador, identificadores enviados por el cliente y roles locales no son fuentes de autorización.
- Toda consulta o mutación institucional debe volver a validar en servidor el actor, la institución y el alcance solicitado.

## Operaciones previstas (no activas)

1. Instituciones: listar, crear solicitud/registro, activar, suspender y consultar estado.
2. Administradores institucionales: asignar, cambiar o revocar membresías/roles dentro de una institución.
3. Trazabilidad: consultar el historial de operaciones y sus resultados sin permitir editar o borrar eventos desde la consola.

## Contrato de seguridad obligatorio antes de habilitar mutaciones

- Endpoints de servidor bajo `/api/platform/*`; nunca llamadas privilegiadas desde componentes cliente.
- Guard común que valide sesión con `auth.getUser()` y el claim confiable de plataforma. Respuesta fail-closed ante errores de autenticación, autorización o consulta.
- Credenciales administrativas únicamente en entorno servidor, con acceso mínimo y nunca serializadas al cliente.
- Cada mutación requiere un evento de auditoría persistido **antes o en la misma transacción** que el cambio, con actor, acción, objetivo, institución, fecha, correlación, motivo, resultado y metadatos no sensibles.
- Si no puede persistirse la auditoría, la mutación se cancela. No existe modo de emergencia silencioso.
- Proteger contra CSRF, validar esquemas y estados, limitar frecuencia, usar idempotencia para operaciones repetibles y evitar registrar contraseñas, tokens o datos sensibles de estudiantes.
- Las altas/revocaciones de administradores deben verificar la pertenencia institucional y evitar que un administrador de colegio modifique roles globales.
- Las acciones destructivas o de suspensión deben exigir motivo y confirmación explícita; evaluar doble aprobación para acciones de impacto transversal.
- Pruebas negativas obligatorias: usuario sin claim, claim en `user_metadata`, administrador institucional, membresía inactiva, institución ajena, auditoría indisponible, repetición idempotente y fallo parcial.

## Dependencias que faltan

- Modelo de auditoría inmutable y políticas de acceso.
- Operación segura de servidor para administrar instituciones y membresías.
- Política de retención y acceso a eventos de auditoría.
- Procedimiento controlado para provisionar el primer Superadministrador.
- Pruebas de integración con identidades sintéticas y verificación de aislamiento.

Estas dependencias requieren diseño y autorización explícita para cambios de backend. Hasta entonces, la consola no debe exponer botones de alta, suspensión, asignación o revocación.

## Secuencia de implementación

1. Aprobar el modelo de auditoría y sus controles.
2. Implementar el guard global y las operaciones servidoras sin exponer credenciales.
3. Añadir pruebas de autorización positiva y negativa en entorno aislado.
4. Revisar logs y trazabilidad con datos sintéticos.
5. Recién después, habilitar cada operación por separado y con autorización expresa.

## Restricciones de alcance vigentes

No modificar Supabase ni Render, no provisionar usuarios, no aplicar migraciones, no habilitar privilegios ni contratar servicios. Mantener todo el trabajo de código en `feature/EDUNEXA-MODELES`.

## Matriz de operaciones globales para la siguiente etapa (diseño solamente)

| Operación | Actor permitido | Alcance | Evidencia obligatoria |
|---|---|---|---|
| Listar instituciones | Superadministrador global | Todas, con paginación y filtros | Evento de consulta administrativa y correlación |
| Crear institución | Superadministrador global | Nuevo tenant, estado inicial pendiente | Solicitud, actor, motivo, identificador idempotente |
| Activar / suspender | Superadministrador global | Una institución identificada por ID | Estado anterior/nuevo, motivo, aprobación y resultado |
| Asignar administrador | Superadministrador global | Una institución específica | Usuario objetivo, institución, rol limitado y motivo |
| Revocar administrador | Superadministrador global | Una institución específica | Rol retirado, efectos derivados y motivo |
| Consultar auditoría | Superadministrador global / auditor autorizado | Solo lectura, filtros acotados | Registro de acceso y exportación |

### Contratos de servidor propuestos (sin endpoints activos)

- GET /api/platform/institutions: paginación por cursor; filtros status y búsqueda normalizada; nunca devolver secretos, credenciales ni datos de alumnos.
- POST /api/platform/institutions: valida nombre, slug normalizado y unicidad; crea en estado pending; no activa automáticamente una institución.
- POST /api/platform/institutions/:id/status: acepta solo transiciones declaradas (pending a active, active a suspended, suspended a active), motivo obligatorio, Idempotency-Key y versión esperada del registro.
- POST /api/platform/institutions/:id/administrators: acepta identidad verificada y rol institution_admin únicamente; no acepta platform_role ni atributos de autorización del cliente.
- DELETE /api/platform/institutions/:id/administrators/:membershipId: revoca solo la membresía de esa institución; bloquea autorrevocación y requiere motivo.
- GET /api/platform/audit: lectura paginada de eventos inmutables; filtros por actor, acción, institución y ventana temporal; no expone secretos ni payloads sensibles.

### Modelo lógico de auditoría (no es una migración)

Campos mínimos a diseñar: id, occurred_at, actor_user_id, actor_platform_role, action, target_type, target_id, institution_id, reason, request_id, idempotency_key, before_state_hash, after_state_hash, outcome, failure_code y metadata_redacted.

Reglas: append-only; sin UPDATE/DELETE para roles de aplicación; timestamps generados por servidor; integridad referencial cuando corresponda; retención y exportación controladas; acceso de lectura separado del permiso para operar. La escritura de auditoría y el cambio deben compartir transacción o ejecutarse mediante una única función de servidor transaccional. No alcanza con registrar el evento después de confirmar el cambio.

### Matriz de pruebas negativas y aislamiento

- No autenticado: 401.
- Usuario normal, tutor, docente o alumno con claim ausente: 403.
- user_metadata.platform_role=superadmin sin app_metadata.platform_role: 403.
- Administrador institucional intentando listar otra institución o asignar un rol global: 403.
- Institución inexistente o suspendida para una operación no permitida: 404/409 sin revelar información adicional.
- Motivo ausente, transición inválida, versión obsoleta o idempotencia reutilizada con otro cuerpo: 400/409.
- Auditoría inaccesible o transacción fallida: rollback completo; ninguna mutación parcial.
- Reintento válido con la misma clave idempotente: mismo resultado, sin duplicar operaciones ni eventos.
- Exportación de auditoría: nunca incluye tokens, contraseñas, secretos, emails de alumnos ni datos académicos personales.

### Criterio de habilitación

Cada operación se habilitará por separado únicamente después de revisar el modelo de auditoría, probar transacciones y rollback, verificar aislamiento entre dos instituciones sintéticas y obtener aprobación explícita. Hasta entonces, estos contratos son especificación y no deben convertirse en rutas mutadoras.
