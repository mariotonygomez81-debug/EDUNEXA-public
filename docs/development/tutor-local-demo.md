# Demostración local del Módulo Tutor

## Objetivo

La ruta `/demo/dashboard` abre el tablero local de módulos de EDUNEXA. Desde la tarjeta Tutor se ingresa al portal de familias de demostración en `/demo/dashboard/tutor`. La ruta directa `/demo/tutor` también se conserva como acceso alternativo. Ambas permiten recorrer una demostración visual e interactiva del portal Tutor sin autenticar usuarios y sin conectarse a Supabase, Groq, Render ni otros servicios externos.

## Requisitos

- Windows, macOS o Linux.
- Node.js 22.
- npm.
- Acceso de lectura al repositorio.

## Puesta en marcha en Windows (PowerShell)

Desde una carpeta donde quieras guardar el proyecto:

```powershell
git clone --branch feature/tutor-module --single-branch https://github.com/mariotonygomez81-debug/EDUNEXA-public.git EDUNEXA
cd EDUNEXA
node --version
npm --version
npm install
npm run dev
```

Abrir en el navegador:

```text
http://localhost:3000/demo/dashboard
```

Para detener el servidor, volver a PowerShell y presionar `Ctrl+C`.

## Protección y límites

- La página servidor comprueba `NODE_ENV === "development"`; en cualquier otro entorno responde como ruta no encontrada.
- La ruta es dinámica y no debe incluirse en una publicación de producción.
- La interfaz usa exclusivamente datos ficticios definidos en el componente.
- No importa clientes, acciones ni helpers de Supabase.
- No llama a Groq ni a ninguna API externa.
- No usa credenciales, variables de entorno, cookies ni sesiones.
- Los cambios de selección de estudiante, navegación, búsqueda de tareas, filtros por estado y lectura de avisos ocurren sólo en memoria del navegador.
- La sección de tareas permite combinar una búsqueda por materia, título o estado con filtros rápidos: todas, sin entregar, entregadas pendientes y aprobadas.
- El centro de notificaciones permite marcar avisos individualmente o todos a la vez como leídos.
- El tablero local presenta la tarjeta Tutor y módulos de referencia deshabilitados; no suplanta el tablero institucional conectado.
- No genera ni descarga boletines PDF reales.
- La demostración no valida el flujo de autenticación, permisos, vinculación ni consultas del portal conectado.

## Seguridad al ejecutar

No copies archivos `.env` de otros entornos. Para esta demostración no se necesita crear `.env.local` ni completar variables de Supabase o Groq. No ejecutes migraciones ni comandos de Supabase para abrir esta ruta.

La ruta no sustituye la validación del portal real. Para probar autenticación, permisos y datos de extremo a extremo se necesitará recuperar y validar primero el esquema fundacional en un entorno local aislado.
