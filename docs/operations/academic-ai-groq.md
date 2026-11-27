# Informes académicos con Groq

EDUNEXA utiliza exclusivamente Groq para generar informes académicos asistidos por IA. No incluye Ollama, modelos locales ni mecanismos de respaldo de inferencia local.

## Configuración del servidor

Configurar las siguientes variables en el entorno seguro del servidor:

- `GROQ_API_KEY`: clave privada de la API de Groq. Nunca incluirla en el navegador, en archivos versionados ni en mensajes.
- `GROQ_REPORT_MODEL`: opcional; modelo de Groq para los informes. El valor predeterminado del código es `openai/gpt-oss-20b`.
- `GROQ_ALLOW_STUDENT_DATA`: debe permanecer en `false` hasta completar la revisión institucional de privacidad, contratos, retención y protección de datos. Sólo una aprobación institucional explícita y documentada permite evaluar su habilitación.

La prueba de Groq con datos ficticios requiere una clave válida en el servidor, pero no requiere habilitar el envío de expedientes académicos reales.

## Flujo de generación

1. El servidor autentica al usuario y valida institución, membresía activa, rol docente y permisos de lectura.
2. Recupera únicamente las fuentes académicas autorizadas y aplica minimización de datos antes de construir el prompt.
3. Si `GROQ_ALLOW_STUDENT_DATA` no es exactamente `true`, bloquea el envío de datos académicos a Groq.
4. Envía la solicitud desde el servidor a la API de Groq. La clave nunca se expone al navegador.
5. Devuelve el resultado con `engine: "groq"` y cabeceras para evitar almacenamiento en caché.
6. El docente debe revisar y aprobar el informe antes de utilizarlo o compartirlo.

## Prueba con datos ficticios

El botón **Probar Groq con datos ficticios** llama a un endpoint separado que utiliza exclusivamente datos inventados. Ese endpoint autentica al docente y verifica permisos, pero no consulta expedientes ni registros académicos de estudiantes.

## Seguridad y privacidad

- Mantener la clave de Groq exclusivamente como secreto del servidor.
- Mantener `GROQ_ALLOW_STUDENT_DATA=false` hasta que la institución complete la evaluación de privacidad y autorice expresamente el tratamiento.
- La minimización reduce la exposición, pero no garantiza anonimización completa: los textos libres pueden contener datos personales de terceros u otra información sensible que un filtro automático no detecte.
- Revisar los campos y textos que se envían al proveedor, sus condiciones de tratamiento y retención, y las obligaciones institucionales aplicables.
- No enviar datos reales durante pruebas o demostraciones; utilizar el endpoint sintético.
- El informe es un borrador asistido por IA, no un diagnóstico ni una decisión automatizada. La revisión docente es obligatoria.
- Las respuestas que contienen prompts o informes se marcan para no ser almacenadas en caché.

## Errores y disponibilidad

Si Groq no está configurado, rechaza la solicitud, limita la cuota o presenta una falla temporal, EDUNEXA informa el error y permite volver a intentar más tarde. No se ejecuta un motor local alternativo.
