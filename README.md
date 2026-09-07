# Ofi 40%

Frontend React/Vite para registrar asistencia a la oficina. Supabase gestiona la sesión por email y contraseña; la API de Render guarda asistencias y provee feriados.

## Configuración local

1. Copiá `.env.example` a `.env.local`.
2. Completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los valores públicos de Supabase. La URL de la API ya apunta al servicio de Render.
3. Ejecutá `pnpm install` y `pnpm dev`.

## Deploy en Vercel

Conectá el repositorio a Vercel, configurá las tres variables `VITE_*` y usá `pnpm run build`. Vercel desplegará cada push a `main`.
