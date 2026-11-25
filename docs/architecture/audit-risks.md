# Riesgos de auditoría pendientes — EDUNEXA

## Alcance y estado

Documento de seguimiento de riesgos detectados durante la revisión de autorización y trazabilidad. Es una especificación de riesgos y controles pendientes; no ejecuta cambios en Supabase ni Render, no aplica migraciones y no habilita operaciones privilegiadas.

## Hallazgos abiertos

### A-01 — Vinculación tutor-alumno y auditoría no atómicas

**Severidad: alta · Estado: abierto · Bloqueo de backend**

La Edge Function `manage-institution-users` realiza cambios en la vinculación tutor/alumno antes de insertar el evento de auditoría. Si la escritura del evento falla, la vinculación puede haber quedado modificada sin evidencia durable correspondiente.

Además, la acción de servidor de `students/actions.ts` actualiza por separado el permiso de visualización de boletines después de que la Edge Function devuelve éxito. Si esa segunda actualización falla, puede persistir la vinculación con el permiso anterior o predeterminado.

**Impacto:** pérdida de trazabilidad y estado parcial/inconsistente en datos familiares sensibles de menores.

**Mitigación requerida:** mover la mutación, el permiso de boletines y el evento de auditoría a una única transacción en una función de servidor/DB controlada; ante fallo de auditoría, rollback completo. Añadir idempotencia, versión esperada y pruebas de fallo inyectado. No se modifica en esta entrega porque el alcance prohíbe tocar Supabase.

### A-02 — Verificación de RLS y RPC no desplegada

**Severidad: alta · Estado: pendiente de verificación en entorno autorizado**

Las rutas de Next.js realizan comprobaciones de rol/permisos, pero no sustituyen la autorización final en RLS/RPC. Algunos flujos dependen de que las funciones y políticas del backend revaliden institución, membresía activa, rol contextual, alumno vinculado, división y asignación docente.

**Impacto:** una ruta protegida podría no ser suficiente si una RPC o política remota acepta un identificador manipulado o no aplica el mismo alcance.

**Mitigación requerida:** auditoría de solo lectura de las políticas/RPC efectivamente desplegadas; pruebas negativas con dos instituciones sintéticas y usuarios por perfil; comprobar denegación por IDOR, membresía inactiva, asignación vencida y pertenencia cruzada. No se afirma que el backend remoto esté verificado en esta entrega.

### A-03 — Operaciones globales de Superadministrador sin bitácora transaccional

**Severidad: crítica · Estado: bloqueante antes de habilitar mutaciones**

No deben habilitarse altas, activaciones/suspensiones de instituciones ni asignaciones/revocaciones de administradores hasta disponer de una bitácora append-only que se escriba en la misma transacción que el cambio.

**Mitigación requerida:** guard global basado exclusivamente en `app_metadata.platform_role`; motivo obligatorio; actor/objetivo/tenant; estado anterior y posterior; request ID; idempotencia; rollback ante fallo de auditoría; segregación de lectura y escritura; controles de doble aprobación para operaciones de alto impacto.

### A-04 — Cobertura E2E por perfil desactivada

**Severidad: media-alta · Estado: pendiente**

El job `role-login-modules-e2e` no se ejecuta en los eventos push normales; requiere `workflow_dispatch` y configuración explícita de fixtures. Los checks estáticos y PostgreSQL efímero no demuestran un inicio de sesión real en navegador ni el aislamiento de cada perfil en la aplicación desplegada.

**Mitigación requerida:** preparar fixtures sintéticos para los siete módulos institucionales, activar E2E únicamente en entorno de pruebas autorizado y verificar rutas directas, navegación, operaciones y respuestas 401/403. No usar credenciales ni datos reales de alumnos.

## Evidencia y límites

- El job PostgreSQL aislado del CI puede validar scripts SQL contra una instancia efímera, pero no demuestra que las mismas migraciones/políticas estén desplegadas en el proyecto remoto.
- Los checks estáticos validan contratos del código y pueden requerir actualización cuando cambia una política legítima; no deben relajarse para ocultar un fallo real.
- Un job E2E omitido se informa como omitido, nunca como aprobado.
- Los logs de auditoría no deben incluir contraseñas, tokens, secretos, datos académicos ni datos personales innecesarios de menores.

## Criterios de cierre

1. Prueba transaccional que demuestre rollback de mutación y permiso si falla la auditoría.
2. Evidencia de RLS/RPC con identidades sintéticas y aislamiento entre instituciones.
3. Matriz negativa de los siete módulos: cada perfil solo entra en su módulo autorizado; denegación de rutas directas ajenas, membresía inactiva y permisos faltantes.
4. E2E de navegador ejecutado y aprobado con fixtures sintéticos.
5. Revisión y autorización explícita antes de cualquier cambio remoto o habilitación de operaciones globales.

**Restricción vigente:** esta entrega no modifica Supabase ni Render. Los hallazgos A-01 a A-03 permanecen abiertos hasta una etapa backend expresamente autorizada.
