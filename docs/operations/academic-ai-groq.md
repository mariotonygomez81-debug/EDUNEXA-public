# IA académica con Groq

EDUNEXA utiliza exclusivamente Groq para generar informes académicos asistidos por IA. No se implementa inferencia local, Ollama ni un proveedor alternativo automático.

## Funcionamiento

1. El servidor EDUNEXA autentica al usuario y valida membresía, rol docente, permisos y acceso al alumno.
2. El servidor recupera únicamente las fuentes autorizadas y prepara un prompt minimizado y seudonimizado.
3. El servidor envía la solicitud a la API de Groq utilizando una clave almacenada exclusivamente en variables de entorno del servidor.
4. La respuesta se devuelve sin caché, identificada como generada por Groq, para revisión y aprobación del docente.

Si Groq no está disponible, rechaza la solicitud o alcanza sus límites, EDUNEXA informa el error y no utiliza otro motor. El docente podrá volver a intentar cuando el servicio esté disponible.

## Configuración del servidor

- Configurar `GROQ_API_KEY` como secreto del entorno de ejecución del servidor (por ejemplo, en Render).
- Nunca incluir la clave en el código cliente, repositorio, archivos públicos ni mensajes de chat.
- `GROQ_REPORT_MODEL` permite seleccionar el modelo configurado; el valor inicial del código es `openai/gpt-oss-20b`.
- `GROQ_ALLOW_STUDENT_DATA` debe permanecer en `false` hasta que la institución complete la revisión de privacidad, contratos, retención, transferencias y controles del proveedor y otorgue aprobación formal. El endpoint de informes reales responde con error mientras el gate no esté habilitado.
- La casilla de autorización de la interfaz no sustituye la aprobación institucional ni el control del servidor.

## Datos y privacidad

El servidor omite el nombre y número de legajo del alumno, filtra identificadores directos comunes en textos y no envía UUID internos de períodos académicos. Esto reduce exposición, pero no garantiza anonimización completa: los textos libres pueden contener datos personales de terceros u otros datos sensibles que un filtro automático no detecte. La institución debe revisar las fuentes y los textos antes de autorizar el envío a Groq.

No habilitar el envío de datos académicos reales hasta completar la evaluación institucional de privacidad y seguridad. Las pruebas de conectividad con Groq utilizan exclusivamente datos ficticios y no consultan expedientes de estudiantes.

## Seguridad y revisión docente

- Las claves de Groq permanecen exclusivamente en el servidor.
- Las respuestas con prompts o informes se marcan para no ser almacenadas en caché.
- El informe es un borrador asistido por IA, no un diagnóstico ni una decisión automatizada.
- El docente debe verificar los datos, contextualizar las conclusiones, corregir el contenido y aprobarlo antes de compartirlo.
- Si Groq falla, no se utiliza un motor alternativo; se informa el error y se puede reintentar.
