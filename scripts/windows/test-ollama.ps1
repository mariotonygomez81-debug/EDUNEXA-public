# EDUNEXA - Verificación previa de Ollama en Windows
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$EdunexaOrigin = ""
)

$ErrorActionPreference = "Stop"
$ModelName = "qwen2.5:3b"
$ApiUri = "http://127.0.0.1:11434/api/tags"

function Stop-WithMessage([string]$Message, [int]$Code = 1) {
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    exit $Code
}

if ([string]::IsNullOrWhiteSpace($EdunexaOrigin)) {
    Write-Host "Origen HTTPS de EDUNEXA: todavía no configurado (se puede indicar más adelante)." -ForegroundColor Yellow
} else {
    try {
        $originUri = [System.Uri]$EdunexaOrigin
    } catch {
        Stop-WithMessage "El origen indicado no es una URL válida. Ejemplo: https://edunexa.example.edu"
    }

    if (-not $originUri.IsAbsoluteUri -or $originUri.Scheme -ne "https" -or
        $originUri.UserInfo -or $originUri.Query -or $originUri.Fragment -or
        ($originUri.AbsolutePath -ne "/" -and $originUri.AbsolutePath -ne "")) {
        Stop-WithMessage "Indicá solamente el origen HTTPS de EDUNEXA, sin rutas, parámetros ni barra final."
    }

    $EdunexaOrigin = $originUri.GetLeftPart([System.UriPartial]::Authority)
    if ($EdunexaOrigin.Contains("*")) {
        Stop-WithMessage "No se permite un origen comodín. Usá el dominio HTTPS exacto de EDUNEXA."
    }
}

Write-Host "EDUNEXA - Verificación local de Ollama" -ForegroundColor Cyan
if (-not [string]::IsNullOrWhiteSpace($EdunexaOrigin)) { Write-Host "Origen exacto que deberás configurar: $EdunexaOrigin" }
Write-Host "Modelo requerido: $ModelName"
Write-Host ""

$ollama = Get-Command "ollama" -ErrorAction SilentlyContinue
if (-not $ollama) {
    Stop-WithMessage "No se encontró Ollama en PATH. Instalalo desde https://ollama.com/download y volvé a ejecutar este verificador."
}
Write-Host "[OK] Comando Ollama encontrado: $($ollama.Source)" -ForegroundColor Green

try {
    $version = & ollama --version 2>&1
    Write-Host "[OK] $version" -ForegroundColor Green
} catch {
    Stop-WithMessage "Ollama está instalado, pero no se pudo consultar su versión."
}

$response = $null
try {
    $request = [System.Net.HttpWebRequest]::Create($ApiUri)
    $request.Method = "GET"
    $request.Timeout = 5000
    $request.ReadWriteTimeout = 5000
    $webResponse = $request.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
        try {
            $response = $reader.ReadToEnd() | ConvertFrom-Json
        } finally {
            $reader.Dispose()
        }
    } finally {
        $webResponse.Dispose()
    }
} catch {
    $newline = [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($EdunexaOrigin)) {
        $instructions = "No responde Ollama en 127.0.0.1:11434. Iniciá Ollama con ollama serve y ejecutá nuevamente este verificador. Cuando EDUNEXA tenga un dominio HTTPS definitivo, configuraremos OLLAMA_ORIGINS con ese origen exacto."
    } else {
        $instructions = "No responde Ollama en 127.0.0.1:11434. Cerrá cualquier instancia existente y abrí PowerShell con el origen exacto configurado:" +
            $newline + '$env:OLLAMA_ORIGINS = "' + $EdunexaOrigin + '"' +
            $newline + "ollama serve" + $newline +
            "Luego ejecutá este verificador nuevamente. Este script no detiene ni modifica servicios."
    }
    Stop-WithMessage $instructions
}

Write-Host "[OK] API local de Ollama responde en loopback." -ForegroundColor Green

$models = @($response.models)
$installed = $models | Where-Object { $_.name -eq $ModelName }
if (-not $installed) {
    Write-Host "[PENDIENTE] Falta el modelo $ModelName." -ForegroundColor Yellow
    Write-Host "Descargalo con: ollama pull $ModelName"
    exit 2
}
Write-Host "[OK] Modelo $ModelName disponible." -ForegroundColor Green

Write-Host ""
Write-Host "Verificación básica completada. No se generó ningún informe ni se consultaron datos de estudiantes." -ForegroundColor Green
Write-Host "Importante: este script no puede confirmar qué valor OLLAMA_ORIGINS recibió el proceso que ya está ejecutándose."
if (-not [string]::IsNullOrWhiteSpace($EdunexaOrigin)) { Write-Host "Configurá OLLAMA_ORIGINS=$EdunexaOrigin antes de iniciar Ollama y mantené el servicio ligado a 127.0.0.1:11434." } else { Write-Host "Cuando EDUNEXA tenga dominio HTTPS definitivo, configurá OLLAMA_ORIGINS con ese origen antes de iniciar Ollama." }
Write-Host "Después, en EDUNEXA, usá 'Probar IA local con datos ficticios'."
exit 0
