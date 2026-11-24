# Auditoría de integración del portal del tutor

- Fecha: 2026-11-24
- Repositorio: `mariotonygomez81-debug/EDUNEXA-public`
- Rama: `feature/tutor-module`
- Alcance: inspección estática del código versionado. Sin conexión a Supabase hosted, sin escrituras SQL, sin despliegues.

## 1. Resultado ejecutivo

El portal familiar ya está alojado en la aplicación central de EDUNEXA: `src/app/dashboard/[slug]/portal/page.tsx`. No es necesario crear otro sitio ni otro login para tutores. La página valida la sesión con Supabase Auth, comprueba la membresía institucional activa y exige que la membresía tenga el rol `student` o `guardian`.

La página consume `list_my_portal_students` y, para cada estudiante vinculado que no sea la propia cuenta, consulta `list_my_child_assignment_progress`. También consulta notificaciones dirigidas a la membresía y boletines publicados para los estudiantes devueltos por el RPC.

**La integración de consulta está avanzada; el alta/vinculación de hijos y la edición del perfil del tutor no están implementadas en esta ruta central.** La demo bajo `/demo` no debe considerarse sustituto del flujo definitivo.

## 2. Matriz de funcionalidades observadas

| Área | Evidencia en código | Estado de esta auditoría |
|---|---|---|
| Autenticación central | `supabase.auth.getUser()` y redirección a `/login` | Presente |
| Pertenencia institucional | Consulta de `memberships` por usuario, institución y estado activo | Presente |
| Rol de acceso | Consulta de `membership_roles` y comprobación `student` / `guardian` | Presente |
| Estudiantes vinculados | RPC `list_my_portal_students` | Integración de lectura presente; contrato SQL/RLS requiere validación local |
| Tareas y entregas | RPC `list_my_child_assignment_progress` por estudiante | Integración de lectura presente; SQL de progreso aún figura como borrador en las pruebas estáticas |
| Boletines | Lectura de `report_card_snapshots` filtrada por IDs devueltos por el RPC | Presente en UI; la seguridad final depende de RLS |
| Notificaciones | Filtrado por `institution_id` y `recipient_membership_id` | Presente |
| Asistencia | Ruta hija `portal/attendance/[studentId]` y RPC de asistencia | Presente; revisar autorización negativa en pruebas locales |
| Mensajes y citaciones | Rutas centrales y RPCs de membresía/rol | Integración cubierta por prueba estática |
| Edición de perfil del tutor | No se observa formulario/acción en la página central auditada | Pendiente |
| Vincular un hijo matriculado | No se observa acción/formulario de vinculación en la página central auditada | Pendiente |
| Desvincular o revocar autorización | No se observa flujo en la página central auditada | Pendiente; requiere política institucional y auditoría |

## 3. Hallazgos de seguridad y calidad

1. La UI no es la autoridad de autorización. Los RPC, RLS y restricciones de base deben impedir que un tutor consulte estudiantes no vinculados, incluso manipulando parámetros o llamando directamente a la API.
2. La vinculación no debe resolverse desde el navegador mediante consultas directas a DNI o fecha de nacimiento. La verificación debe ejecutarse en servidor/base, con límites de intentos, respuesta que no permita enumerar estudiantes y auditoría sin guardar DNI/fecha en logs.
3. Una coincidencia de identidad no debe conceder acceso académico automáticamente. Debe existir una relación de tutoría verificable y un estado de aprobación/confirmación definido por el colegio.
4. Nivel, curso, división y ciclo lectivo deben provenir de la matrícula vigente; no deben ser datos ingresados por el tutor.
5. Los boletines y asistencia requieren pruebas negativas: tutor A no puede consultar estudiante de tutor B, estudiante no vinculado, registro de otra institución o datos no publicados.
6. Los errores de RPC deben fallar de forma cerrada y no mostrar detalles internos ni identificadores sensibles.

## 4. Bloqueo fundacional de Supabase

El inventario `docs/database/supabase-foundation-inventory.md` confirma que la secuencia versionada no contiene un baseline autoritativo para ocho objetos fundacionales: `institutions`, `campuses`, `memberships`, `profiles`, `roles`, `permissions`, `membership_roles` y `role_permissions`.

La revisión del upstream privado y de las migraciones disponibles tampoco encontró un dump o baseline completo. Sin una fuente schema-only autorizada o una especificación DDL aprobada, no es seguro inventar esas tablas ni escribir migraciones que dependan de sus columnas, constraints, triggers, grants y políticas reales.

El inventario también registra que el entorno de esta sesión no dispone de Docker ni Supabase CLI para reconstruir una instancia local. No se consultó ni modificó ninguna base alojada.

## 5. Próximos pasos técnicos, en orden

1. Obtener un dump **sólo de esquema**, sin filas ni datos personales, con procedencia y versión identificables; alternativamente, aprobar una especificación DDL completa de los ocho objetos fundacionales.
2. Preparar Supabase local aislado y reconstruir desde cero, sin `supabase link` ni credenciales cloud. Validar orden de migraciones, Auth, triggers, FK, RLS, grants, RPC y tipos TypeScript.
3. Con el esquema validado, documentar y probar el contrato real de `list_my_portal_students`, incluyendo tutoría, matrícula activa, alcance institucional y permisos de asistencia/calificaciones.
4. Implementar en el portal central la edición segura del perfil del tutor y el flujo persistente para solicitar/vincular un estudiante matriculado. No usar fixtures locales como sustituto.
5. Definir aprobación, revocación y auditoría de la relación tutor-estudiante. Agregar controles anti-enumeración y limitación de intentos.
6. Ejecutar pruebas automatizadas positivas y negativas con usuarios y estudiantes sintéticos en PostgreSQL/Supabase local.
7. Sólo después de superar esas pruebas, considerar cualquier publicación; requiere autorización específica y no forma parte de esta etapa.

## 6. Restricciones respetadas

- Sólo repositorio `mariotonygomez81-debug/EDUNEXA-public`, rama `feature/tutor-module`.
- Un solo colegio en esta instalación; sin selector multiinstitución ni superadministrador global.
- Sin SQL de escritura ni cambios en Supabase hosted.
- Sin despliegues ni cambios en Render.
- Sin datos reales de menores.
- Groq sigue siendo el único proveedor de IA autorizado; esta etapa no requiere IA.
