# Decisión de arquitectura 0001: instalación independiente por colegio

- Estado: Aceptada
- Fecha: 2026-11-20
- Alcance: arquitectura de datos y despliegue de Plataforma Integral Educativa

## Contexto

Cada institución tiene estructura académica, administrativa, normativa y operativa propia. Una base de datos compartida con separación lógica por institution_id puede forzar un modelo común y aumenta el impacto potencial de errores de aislamiento. El producto debe poder adaptarse a las necesidades de cada colegio sin mezclar información.

## Decisión

PIE se desarrollará inicialmente para un solo colegio. Cada colegio tendrá una instalación independiente con:
- Proyecto Supabase propio (PostgreSQL, Auth y Storage).
- Usuarios, perfiles, credenciales, roles y archivos propios.
- Datos académicos y administrativos propios.
- Configuración institucional propia.
- Políticas RLS, auditoría, respaldos y procedimientos de recuperación independientes.

El código fuente y los componentes del producto serán comunes y versionados en un repositorio central. Cada colegio tendrá además su propio repositorio privado de instalación y despliegue, basado en una versión aprobada del núcleo PIE. Los cambios específicos de una institución se mantienen en ese repositorio y no se propagan a los demás colegios. Las mejoras generales del núcleo se publican en el upstream común y se incorporan de forma selectiva, revisada y probada.

## Consecuencias

### Positivas
- Aislamiento fuerte entre instituciones a nivel de infraestructura.
- Personalización profunda de cada colegio.
- Menor radio de impacto ante errores o incidentes en una instalación.
- Respaldos, restauración y mantenimiento independientes.
- Posibilidad de ciclos de actualización coordinados o diferenciados.

### Costos y responsabilidades
- Cada colegio añade recursos de infraestructura y tareas de mantenimiento.
- Cada colegio tendrá repositorio, CI/CD, secretos y despliegues propios.
- Se necesita automatizar aprovisionamiento, actualizaciones y monitoreo.
- Se requiere política de versiones soportadas y mantenimiento de personalizaciones.
- Los costos por colegio deben modelarse antes de ofrecer precios comerciales.

## Reglas de implementación

- No agregar nuevos colegios como tenants en la base de datos actual.
- No compartir Auth, Storage, claves ni repositorios de despliegue entre colegios.
- La tabla institutions puede representar la ficha del único colegio de esa instalación.
- memberships conserva el significado de vínculo de una persona con el colegio y sus roles locales; no representa una membresía multi-tenant.
- No eliminar institution_id ni alterar tablas existentes hasta reconstruir y probar las migraciones en una base limpia.
- El plano de control global, si se construye, administra inventario y despliegues pero no replica datos académicos ni concede acceso permanente a los mismos.
