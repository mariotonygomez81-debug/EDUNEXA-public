# EDUNEXA

Plataforma integral de gestión académica y comunicación para instituciones educativas.

> **Estado:** desarrollo activo. Este repositorio es una edición pública de desarrollo y no representa una versión lista para producción.

## Alcance

EDUNEXA reúne herramientas para la gestión institucional, estudiantes, asistencia, calificaciones, boletines, aulas virtuales, comunicación y seguimiento académico. El diseño actual está orientado a una instalación independiente por institución educativa.

## Tecnologías

- Next.js, React y TypeScript
- Supabase: PostgreSQL, autenticación y almacenamiento
- Tailwind CSS
- Groq como único proveedor de IA para informes académicos

## Requisitos

- Node.js 22 o compatible con la versión declarada en el proyecto
- npm
- Un proyecto Supabase propio para desarrollo
- Una clave de API de Groq para probar informes académicos

## Puesta en marcha local

1. Clonar este repositorio.
2. Instalar dependencias:

   ```bash
   npm install
   ```

3. Copiar `.env.example` a `.env.local` y completar únicamente valores de un entorno propio de desarrollo.
4. Aplicar las migraciones de Supabase en una base de datos de desarrollo nueva y controlada.
5. Iniciar el servidor:

   ```bash
   npm run dev
   ```

No reutilizar credenciales, proyectos de infraestructura ni datos de otras instalaciones. No ejecutar migraciones contra una base institucional existente sin una revisión y un plan de migración.

## IA para informes académicos

EDUNEXA utiliza exclusivamente Groq para generar informes académicos. Si Groq no está disponible o alcanza sus límites, se informa el error y no se cambia a otro proveedor. Consultar [la guía de IA académica con Groq](docs/operations/academic-ai-groq.md).

## Seguridad y privacidad

- No cargar datos reales de estudiantes, familias o personal en este repositorio ni en pruebas públicas.
- No publicar archivos `.env`, claves, tokens, contraseñas, exportaciones de bases de datos ni credenciales.
- Mantener los secretos exclusivamente en variables de entorno protegidas.
- Usar datos sintéticos en desarrollo y pruebas.
- No habilitar procesamiento de datos académicos reales por proveedores externos sin autorización institucional, evaluación de privacidad y controles contractuales apropiados.
- Todo informe generado por IA requiere revisión humana docente.
- Reportar vulnerabilidades de forma responsable al mantenedor; no publicar datos sensibles en issues.

## Comandos útiles

Los comandos disponibles se encuentran en `package.json`. Entre ellos, según la configuración del proyecto:

```bash
npm run dev
npm run lint
npm run build
```

## Contribuciones

Las contribuciones deben incluir una descripción del cambio, el impacto en permisos y privacidad cuando corresponda, y las comprobaciones realizadas. No incluir secretos ni información identificable en commits, issues o pull requests.

## Licencia

La licencia del proyecto aún no está definida. La publicación del código en este repositorio no concede por sí sola permisos adicionales de uso, modificación o redistribución.
