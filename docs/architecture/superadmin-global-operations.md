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
