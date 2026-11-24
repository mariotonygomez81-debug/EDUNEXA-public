# Demostración local del Módulo Tutor

## Objetivo

La ruta `/demo/tutor` permite recorrer una demostración visual e interactiva del portal Tutor sin autenticar usuarios y sin conectarse a Supabase, Groq, Render ni otros servicios externos.

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
http://localhost:3000/demo/tutor
```

Para detener el servidor, volver a PowerShell y presionar `Ctrl+C`.

## Protección y límites

- La página servidor comprueba `NODE_ENV === "development"`; en cualquier otro entorno responde como ruta no encontrada.
- La ruta es dinámica y no debe incluirse en una publicación de producción.
- La interfaz usa exclusivamente datos ficticios definidos en el componente.
- No importa clientes, acciones ni helpers de Supabase.
- No llama a Groq ni a ninguna API externa.
- No usa credenciales, variables de entorno, cookies ni sesiones.
- Los cambios de selección de estudiante, navegación y lectura de avisos ocurren sólo en memoria del navegador.
- No genera ni descarga boletines PDF reales.
- La demostración no valida el flujo de autenticación, permisos, vinculación ni consultas del portal conectado.

## Seguridad al ejecutar

No copies archivos `.env` de otros entornos. Para esta demostración no se necesita crear `.env.local` ni completar variables de Supabase o Groq. No ejecutes migraciones ni comandos de Supabase para abrir esta ruta.

La ruta no sustituye la validación del portal real. Para probar autenticación, permisos y datos de extremo a extremo se necesitará recuperar y validar primero el esquema fundacional en un entorno local aislado.
