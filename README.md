# Conoce tu bici

Aplicación web interactiva en 3D para aprender cómo está hecha y cómo funciona una bicicleta, y cómo arreglar los problemas más comunes. Todo el contenido está en español.

Las bicicletas se construyen por código con [Three.js](https://threejs.org/): no hay modelos 3D externos. Cada pieza es una malla etiquetada, por eso se puede tocar, resaltar y separar del resto.

## Qué se puede hacer

- **Elegir entre 7 modelos:** Montaña, Ruta pro, Urbana, Eléctrica, Plegable, BMX e Infantil.
- **Explorar en 3D:** arrastra para girar y usa la rueda del ratón o el pellizco para acercar.
- **Tocar cualquier pieza** para ver su nombre, qué hace, cómo funciona y los problemas típicos con su solución.
- **Pedalear:** las ruedas, la cadena, los piñones y las bielas se animan, y el panel de cambios muestra la marcha activa y cuántas vueltas da la rueda por pedalada.
- **Separar piezas** (vista explosionada) para ver cómo se arma la bici.
- **Plegar** la bicicleta plegable, con la tija bajando por dentro del tubo del sillín, y **quitar o poner las rueditas de apoyo** en la infantil.
- **Calidad alta o fluida**, según lo que aguante el equipo.

## Paneles laterales

| Pestaña | Contenido |
|---|---|
| Partes | Lista de piezas del modelo elegido, con búsqueda por cualquier nombre (admite sinónimos). |
| Cómo funciona | Prueba de las marchas (platos × piñones) y explicación de la transmisión del modelo elegido. |
| Arreglar | Diagnóstico por síntoma («¿Qué le pasa a tu bici?»): marca en el modelo las piezas que suelen causarlo y da guías de reparación paso a paso. |
| Talla | Calculadora para elegir la talla de adulto o de niño. |
| Juego | 10 preguntas sobre las piezas, en dos modos: «¿Qué pieza es?» y «Encuentra la pieza», con mejor puntaje guardado. |

## Frenos

Cada modelo lleva el tipo de freno que usa en la realidad:

- **Disco hidráulico** (Montaña, Eléctrica, Ruta pro): el disco va entre la rueda y la horquilla o vaina, con la pinza montada junto a él.
- **Zapatas sobre la llanta, tipo V-brake** (Urbana, Infantil, Plegable y BMX, esta solo atrás): dos brazos que pivotan en la horquilla o vaina, con la zapata de goma contra la llanta y el cable entrando por la parte de arriba.

## Cómo ejecutarlo

No necesita instalación ni compilación. Es HTML, CSS y módulos de JavaScript. Three.js y las tipografías se cargan desde internet (CDN y Google Fonts), así que hace falta conexión.

Los módulos ES no funcionan abriendo el archivo con doble clic (`file://`). Sirve la carpeta con cualquier servidor estático:

```bash
# con Python
python -m http.server 8000

# o con Node
npx serve
```

Después abre `http://localhost:8000` en el navegador.

## Estructura

```
index.html            Página principal
css/styles.css        Estilos
js/main.js            Escena 3D, los 7 modelos de bicicleta, animaciones e interfaz
js/search.js          Búsqueda de piezas con normalización de texto
js/data/parts.js      Textos de cada pieza (qué es, cómo funciona, problemas)
js/data/kb.js         Base de conocimiento de las pestañas «Cómo funciona» y «Arreglar»
js/data/diag.js       Árboles de diagnóstico de averías
js/data/synonyms.js   Sinónimos para encontrar piezas por otros nombres
```

## Tecnologías

- [Three.js](https://threejs.org/) 0.160, cargado como módulo ES con `importmap`.
- JavaScript, HTML y CSS, sin framework ni herramientas de compilación.
