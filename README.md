# Actas online · Fútbol sala y Fútbol 5

Web para que los árbitros cumplimenten las actas de los partidos (1ª y 2ª División de Fútbol Sala y Liga Nacional de Fútbol 5) desde el móvil. El entrenador de cada equipo firma con un código propio, y al cerrar se genera el PDF con el formato de los modelos de la FEDC.

Funciona entera en GitHub Pages: no hace falta servidor, base de datos ni cuentas externas.

## Cómo funciona

| Quién | Qué hace | Dónde |
|---|---|---|
| Administrador (tú) | Da de alta árbitros, equipos, plantillas y genera los códigos de firma | `admin.html` |
| Árbitro | Entra con usuario y contraseña, crea el acta, rellena datos, jugadores, goles, tarjetas, faltas y resultado | `index.html` |
| Entrenador | Revisa el acta en el móvil del árbitro y escribe el código de su equipo | `index.html`, pestaña «Firmas y cierre» |
| Árbitro | Cierra el acta con su contraseña y envía el PDF (compartir, correo o descarga) | `index.html` |

**Firma del entrenador:** si después de firmar se cambia cualquier dato del acta (salvo las observaciones), la firma se anula y hay que volver a firmar.

**Cierre sin firma:** el acta se puede cerrar aunque falte la firma de un entrenador. El árbitro elige el motivo, que queda reflejado en el recuadro de firma y en las observaciones del PDF.

**Jugadores:** aparecen los de la plantilla precargada y el árbitro marca quién juega. También puede añadir jugadores a mano, o elegir «Otro equipo» y escribirlo todo. El límite es el del modelo de acta: 8 jugadores de campo y 2 porteros.

**Sin cobertura:** tras abrir la web una vez con conexión, funciona sin internet. Los borradores se guardan solos en el dispositivo, cifrados.

## Publicarlo en GitHub (una sola vez)

1. Crea un repositorio nuevo en GitHub, por ejemplo `actas`.
2. Sube **todo el contenido** de esta carpeta: «Add file» → «Upload files», arrastra los archivos y carpetas y pulsa «Commit changes». Incluye el archivo oculto `.nojekyll`.
3. Ve a **Settings → Pages**. En «Branch» elige `main` y la carpeta `/ (root)`, y pulsa «Save».
4. En uno o dos minutos la web estará en `https://TU-USUARIO.github.io/actas/`.

## Primeros pasos: sustituir la configuración de prueba

La carpeta `data/config.json` trae datos de **demostración**:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin-demo-2026` | Administrador |
| `arbitro` | `arbitro-demo-2026` | Árbitro |

Los equipos de prueba usan los códigos `DEMO1S`, `DEMO2S`… `DEMO6F`, `DEMO7F`.

**Antes de usarla de verdad:**

1. Abre `https://TU-USUARIO.github.io/actas/admin.html` y pulsa **«Crear configuración nueva»**. Así se genera una clave de cifrado nueva y los usuarios de demostración dejan de existir.
2. Da de alta los árbitros (pestaña «Árbitros y usuarios»). Usa contraseñas de al menos 10 caracteres; el botón «Sugerir contraseña» genera una.
3. Da de alta los equipos de cada competición, con su entrenador, guía (en fútbol 5) e instalación habitual.
4. Para cargar la plantilla, usa «Pegar lista» y pega las columnas de Excel: dorsal, apellidos, nombre y posición.
5. En **«Publicar»**, pulsa «Generar códigos para los equipos que no tienen». Descarga la **hoja de códigos** y entrega a cada entrenador el suyo. Los códigos solo se pueden ver en ese momento.
6. Pulsa **«Descargar config.json»** y súbelo a la carpeta `data` del repositorio, sustituyendo al anterior.

Cada vez que cambies algo en la administración (un árbitro nuevo, un fichaje, un código), repite el paso 6.

## Logo en el PDF

Si añades el logo de la federación como `assets/logo.png` (o `assets/logo.jpg`), aparecerá en la cabecera del acta. Sin logo, se muestra el nombre de la organización.

## Seguridad: qué protege y qué no

- `config.json` es público en GitHub, pero está **cifrado** (AES-256 con claves derivadas de cada contraseña mediante PBKDF2). Sin un usuario y contraseña válidos no se puede leer ni un nombre de jugador.
- Los **códigos de entrenador** no se guardan, solo su huella. Ni el árbitro ni nadie que mire el código puede averiguarlos.
- Cada PDF lleva un número de acta, la fecha y hora de cierre, el árbitro que la cerró y un código de verificación. También lleva los datos completos del acta en un adjunto `acta-….json` dentro del propio PDF, útil si más adelante quieres procesar estadísticas.
- **Límites que debes conocer:**
  - Las actas cerradas solo existen en el móvil del árbitro hasta que te envía el PDF. No hay un archivo central de actas.
  - Un usuario eliminado deja de poder entrar con la configuración nueva. Sin embargo, el historial de Git conserva las versiones antiguas de `config.json`. Si alguna vez necesitas revocar a alguien de forma estricta, crea una configuración nueva.
  - Como todo se comprueba en el navegador, esto es adecuado para la gestión de actas, no para datos de alto riesgo.

## Web pública de ligas (clasificaciones, resultados y goleadores)

Dirección: `https://TU-USUARIO.github.io/ACTAS/liga/`

Se puede instalar en el móvil como una app («Añadir a pantalla de inicio») y funciona sin conexión con los últimos datos descargados.

**Publicación automática (recomendada):** cuando el árbitro cierra el acta, el resultado y los goleadores se publican solos en la web, en uno o dos minutos. Si no hay cobertura, la app lo guarda y lo publica en cuanto vuelve la conexión.

Para activarla, una sola vez:

1. Crea una clave de GitHub (fine-grained token):
   - Ruta: tu foto → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
   - **Repository access:** «Only select repositories» y elige este repositorio.
   - **Permissions → Contents:** «Read and write». Nada más.
2. En `admin.html` → **Publicar** → «Publicación automática de resultados», pega la clave y pulsa **Comprobar y activar**.
3. Pulsa **Publicar en GitHub**. Los árbitros reciben la configuración al volver a entrar en la app.

Desde ese momento, todo lo que guardes en la administración se publica también directamente, sin descargar ni subir archivos. Esto incluye las ediciones de partidos y los cambios de equipos, usuarios o códigos.

**Actas pendientes de revisar:** un acta no se publica sola en tres casos, y queda en esta bandeja de la pestaña «Liga y resultados» para que decidas:
- el partido ya tenía un resultado que tú editaste a mano;
- el partido ya tenía resultado de otra acta;
- no se encuentra el partido en el calendario.

**Seguridad de la clave:** se guarda cifrada en `config.json` y solo se descifra al iniciar sesión. Da acceso únicamente a este repositorio. Cualquier persona con usuario de árbitro podría, con conocimientos técnicos, extraerla. Si crees que se ha filtrado, bórrala en GitHub, crea otra y cámbiala en la administración. El historial de GitHub permite deshacer cualquier cambio.

**Sin publicación automática:** los árbitros envían el PDF. En **Liga y resultados** arrastras los PDF, pulsas **Descargar liga.json** y lo subes a la carpeta `data`.

**Otras cosas que se hacen desde esa pestaña:**

- **Editar un partido:** fecha, hora, sede, instalación o equipos. En la fase final de 2ª los equipos se asignan solos al importar el acta, o a mano.
- **Resultado a mano:** para aplazados, suspendidos, incomparecencias o partidos sin acta, con una nota pública opcional.
- **Nombres de los goleadores:** elige cómo se publican (nombre y primer apellido, inicial o completo). En la web nunca aparecen los motivos de las tarjetas, los DNI ni nada más del acta.

**Clasificación:** victoria 3 puntos y empate 1. Los empates a puntos se resuelven por enfrentamientos directos, después por diferencia de goles general y después por goles a favor. Si el reglamento dice otra cosa, se ajusta en `js/liga-core.js`.

## Estructura

```
index.html          App del árbitro
admin.html          Panel de administración
data/config.json    Configuración cifrada (equipos, plantillas, usuarios, huellas de códigos)
js/cripto.js        Cifrado y códigos de firma
js/app.js           Lógica de las actas
js/pdf-acta.js      Generación del PDF (modelos FS y F5)
js/admin.js         Panel de administración
js/admin-liga.js    Pestaña «Liga y resultados» (importar actas, publicar liga.json)
js/liga-core.js     Cálculo de clasificaciones y goleadores, y paso de acta a resultado (compartido)
js/github.js        Publicación directa en el repositorio (API de GitHub)
data/liga.json      Calendarios y resultados publicados (público)
liga/               Web pública de clasificaciones, resultados y goleadores
js/comun.js         Utilidades
css/estilos.css     Estilos
vendor/pdf-lib.min.js  Librería PDF (licencia MIT)
sw.js, manifest.webmanifest  Uso sin conexión e instalación en el móvil
```
