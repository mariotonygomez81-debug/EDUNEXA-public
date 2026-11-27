# Decisión de arquitectura 0002: administradores, superadministrador y repositorios por colegio

- Estado: Aceptada
- Fecha: 2026-11-20
- Alcance: gobierno, soporte y ciclo de cambios de cada instalación PIE

## Roles de gobierno

### Administrador del colegio

Cada instalación tendrá uno o más usuarios con el rol local institution_admin. El administrador institucional dispondrá de todos los permisos funcionales de su colegio: configuración académica y administrativa, usuarios, asignación de roles, módulos, calendarios, períodos, reglas, comunicaciones, apariencia y parámetros institucionales.

Este rol no concede acceso a otras instalaciones, al panel global PIE, a secretos de infraestructura ni a la administración de repositorios de otros colegios.

### Superadministrador PIE

Existirá un rol global separado de los roles escolares. El superadministrador podrá:
- Ver el inventario y estado operativo de las instalaciones.
- Acceder al panel de configuración de una instalación seleccionada.
- Realizar cambios de configuración autorizados para esa institución.
- Gestionar versiones, despliegues y tareas de mantenimiento de cada instalación.
- Iniciar soporte excepcional con alcance limitado y registro de auditoría.

El superadministrador no debe usar una cuenta escolar compartida ni una clave global incrustada en las aplicaciones. La identidad global, MFA y autorización se administran en un plano de control separado. El acceso de soporte a datos personales o académicos no se presume por ser superadministrador: requiere motivo, alcance, duración limitada, registro inmutable y, cuando corresponda, autorización institucional.

## Separación entre plano de control y plano institucional

El plano de control PIE mantiene únicamente el inventario técnico necesario para administrar instalaciones: identificador interno, colegio, URL, proyecto asociado, repositorio, rama, versión desplegada, estado, canal de actualización y referencias seguras a secretos. No replica registros de alumnos, familias, docentes, calificaciones ni asistencia.

Cada instalación mantiene su propio plano de datos y aplicación: proyecto Supabase, PostgreSQL, Auth, Storage, credenciales, configuración, usuarios y datos del colegio.

El plano de control no debe guardar claves service_role ni credenciales en texto plano. Utilizar un gestor de secretos y credenciales de mínima autoridad, con rotación y auditoría.

## Repositorio GitHub independiente por colegio

Cada colegio tendrá su propio repositorio privado de código/despliegue. El repositorio común de producto funciona como upstream o plantilla mantenida por el equipo PIE; no es el repositorio de producción compartido por todos los colegios.

Al crear una instalación:
1. Crear un repositorio privado a partir de una versión aprobada del núcleo PIE.
2. Registrar la relación instalación ↔ repositorio ↔ rama ↔ versión.
3. Configurar secretos y entornos de CI/CD exclusivos para ese colegio.
4. Conectar el repositorio con el servicio de despliegue de esa instalación.
5. Mantener migraciones, configuración no secreta y personalizaciones en control de versiones.

Los cambios de software hechos para un colegio se guardan en su repositorio y se despliegan únicamente en esa instalación. No deben propagarse automáticamente a los demás colegios.

## Tipos de cambio

- Configuración institucional (niveles, períodos, materias, roles, textos, apariencia y reglas): se guarda en la base de datos/configuración de esa instalación; no necesita por sí misma modificar el código.
- Personalización de software exclusiva (módulo, integración o comportamiento específico): se desarrolla en el repositorio privado del colegio y se despliega solo allí.
- Mejora general del núcleo: se desarrolla en el repositorio upstream común. Cada colegio recibe la actualización solo después de revisión, compatibilidad, pruebas y aprobación/despliegue controlado.
- Migración de base de datos: se versiona en el repositorio de la instalación, se prueba sobre copia/entorno de staging y se aplica con respaldo y plan de reversión. Nunca ejecutar una migración destructiva sin validación y aprobación.

## Reglas de seguridad del flujo

- Repositorios privados y permisos mínimos; ningún token personal amplio en servicios de ejecución.
- Automatizaciones con GitHub App o credenciales de instalación acotadas al repositorio correspondiente.
- Secretos de cada colegio separados por repositorio y entorno; nunca copiar secretos entre colegios.
- Protección de rama principal, revisión de cambios, CI y registro de despliegues.
- Las personalizaciones no deben editarse directamente en producción.
- Cada intervención del superadministrador registra quién, colegio, motivo, acción, valores modificados, fecha, resultado y referencia al cambio/deploy.
- No existe sincronización automática de cambios específicos entre colegios.
- La actualización del núcleo común es opt-in o se aplica mediante una política de versiones explícita, nunca como efecto colateral de un cambio particular.

## Consecuencias

- Mayor independencia y capacidad de adaptación por colegio.
- Costos y mantenimiento mayores: repositorios, pipelines, entornos, despliegues y seguimiento de versiones por instalación.
- Se necesita automatizar el aprovisionamiento y el control de versiones para evitar divergencias difíciles de mantener.
- Debe existir una política de soporte y ciclo de vida para ramas y personalizaciones.
