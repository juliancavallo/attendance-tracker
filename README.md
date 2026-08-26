# Ofi 40%

Calendario personal para llevar el control de asistencia a la oficina: calcula el 40% de los días hábiles del mes, descuenta feriados nacionales y vacaciones, y guarda los datos en `localStorage`.

## Publicar en GitHub Pages

1. Subí estos archivos a un repositorio de GitHub.
2. En **Settings → Pages**, elegí desplegar desde la rama principal y la carpeta raíz (`/`).
3. Abrí la URL publicada desde el teléfono o la computadora.

No requiere un servidor ni variables de entorno. La aplicación consulta `https://api.argentinadatos.com/v1/feriados/{año}` y conserva una copia de los feriados por año para poder seguir funcionando si no hay conexión.

> La asistencia y las vacaciones se guardan solamente en el almacenamiento local de cada navegador. No se sincronizan entre dispositivos.
