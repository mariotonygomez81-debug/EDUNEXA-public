# Respaldo local para informes académicos

EDUNEXA puede intentar generar el informe con Ollama en la computadora del docente cuando Groq no responde. El modo local utiliza el modelo `qwen2.5:3b` y no envía el prompt académico a un proveedor de IA externo.

## Requisitos

- Ollama instalado en la computadora docente: https://ollama.com/download
- Modelo descargado previamente mientras exista conexión: `ollama pull qwen2.5:3b`
- Ollama ejecutándose en `127.0.0.1:11434`.
- Navegador con permiso para que el sitio EDUNEXA acceda al servicio local.
- Configurar CORS de Ollama para permitir únicamente el origen HTTPS exacto de la instalación EDUNEXA. No usar `*`.

## Inicio en Windows (PowerShell)

Reemplazar el dominio de ejemplo por el origen exacto de EDUNEXA, sin barra final:

```powershell
$env:OLLAMA_ORIGINS="https://edunexa.example.edu"
ollama serve
```

En otra ventana:

```powershell
ollama pull qwen2.5:3b
ollama list
```

Si Ollama ya se ejecuta como aplicación o servicio, cerrar esa instancia y reiniciarla con la variable de entorno aplicada. La variable debe estar presente en el proceso de Ollama.

## Inicio en macOS / Linux

Cerrar primero cualquier instancia de Ollama que ya esté ejecutándose. Luego:

```bash
export OLLAMA_ORIGINS="https://edunexa.example.edu"
ollama serve
```

En otra terminal:

```bash
ollama pull qwen2.5:3b
ollama list
```

## Comportamiento de EDUNEXA

1. El servidor EDUNEXA autentica al usuario, valida membresía, rol docente, permisos y acceso al alumno.
2. Se construye el mismo conjunto de datos minimizados y seudonimizados utilizado para el informe remoto.
3. Si Groq falla, el navegador solicita el prompt autorizado en modo local y lo envía directamente a `http://127.0.0.1:11434/api/chat`.
4. El resultado indica que fue generado por IA local (Ollama). El docente debe revisarlo antes de utilizarlo.

## Límites y seguridad

- El modo local evita enviar el contenido del informe a Groq, pero la consulta inicial de los registros requiere conexión con el servidor EDUNEXA y Supabase.
- Por lo tanto, esto habilita inferencia local y funcionamiento del motor sin Internet una vez que el prompt está disponible; no significa que toda la plataforma web funcione desconectada.
- No exponer el puerto 11434 a la red pública ni configurar Ollama para escuchar en todas las interfaces. Mantenerlo ligado a loopback.
- CORS no reemplaza autenticación del sistema operativo ni debe tratarse como una frontera de seguridad suficiente. Solo permitir el dominio EDUNEXA exacto.
- La disponibilidad de acceso desde un sitio HTTPS a localhost depende de las políticas de seguridad y permisos del navegador. Debe validarse en los navegadores y equipos institucionales previstos.
- El tamaño 3B es una configuración inicial de compatibilidad; el rendimiento y la calidad dependen de RAM, CPU/GPU y del equipo. Evaluar calidad pedagógica antes de uso institucional.
- No habilitar uso de datos reales hasta completar la revisión institucional de privacidad, seguridad y protección de datos.
- El resultado local debe identificarse como tal y permanecer sujeto a revisión docente. Nunca debe presentarse como diagnóstico ni como decisión automatizada.
