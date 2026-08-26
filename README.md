# Ofi 40%

Calendario personal para llevar el control de asistencia a la oficina: calcula el 40% de los días hábiles del mes, descuenta feriados nacionales y vacaciones, y guarda los datos en `localStorage`.

## Publicar en GitHub Pages

1. Subí estos archivos a un repositorio de GitHub.
2. En **Settings → Pages**, elegí desplegar desde la rama principal y la carpeta raíz (`/`).
3. Abrí la URL publicada desde el teléfono o la computadora.

No requiere un servidor ni variables de entorno. La aplicación consulta `https://api.argentinadatos.com/v1/feriados/{año}` y conserva una copia de los feriados por año para poder seguir funcionando si no hay conexión.

## Sincronización con Supabase

1. En el proyecto de Supabase, abrí **SQL Editor** y ejecutá el contenido de [`supabase.sql`](./supabase.sql).
2. En **Authentication → URL Configuration**, configurá la Site URL y Redirect URL con la dirección pública de esta aplicación.
3. En **Authentication → Providers → Email**, verificá que el acceso por email esté habilitado.

La aplicación conserva una copia local y sincroniza el histórico al iniciar sesión mediante un link mágico enviado por email.
