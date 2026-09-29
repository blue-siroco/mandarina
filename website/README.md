# Mandarina · web estática

Una sola página, cuatro versiones: **español / inglés** × **claro / oscuro**.
Es 100 % estática (HTML + CSS + JS), sin servidor ni paso de compilación obligatorio, lista para **GitHub Pages**.

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio (rama `main`).
2. En GitHub: **Settings → Pages → Build and deploy → Deploy from a branch**.
3. Elige la rama `main` y la carpeta `/ (root)`. Guarda.
4. En un minuto tendrás la web en `https://<usuario>.github.io/<repositorio>/`.

`assets/css/styles.css` ya está compilado y versionado, así que **no hace falta Node** para publicar.
Todas las rutas son relativas, por lo que funciona igual en `usuario.github.io/repo/` que en un dominio propio.

## Cómo elige idioma y tema

Prioridad: **URL** → **elección guardada** (localStorage) → **preferencia del navegador/sistema**.

- Botones ES/EN y de tema en la cabecera; la elección se recuerda.
- Enlaces directos a cada variante (equivalen a tus cuatro páginas originales):
  - `?lang=es&theme=light` · `?lang=es&theme=dark`
  - `?lang=en&theme=light` · `?lang=en&theme=dark`

## Estructura

```
index.html                  la página (texto en español; el inglés se aplica desde translations.js)
assets/js/init.js           decide tema e idioma antes de pintar (evita parpadeos)
assets/js/app.js            idioma, tema, botones de copiar, resaltado del menú
assets/js/translations.js   TODOS los textos, en {es:{…}, en:{…}}
assets/css/styles.css       CSS compilado (Tailwind)  ← se genera, no se edita a mano
src/input.css               colores de los dos temas (variables CSS) y estilos propios
tailwind.config.js          tokens de diseño (colores, tipografías, espaciados)
```

## Editar contenido

- **Un texto:** cada elemento traducible lleva `data-i18n="clave"` en `index.html`. Cambia el texto de esa clave
  en `assets/js/translations.js` (en `es` y en `en`). Si cambias el texto en el HTML, que coincida con `es`.
- **Un color:** `src/input.css`, bloques `:root` (claro) y `.dark` (oscuro).
- **Después de tocar clases de Tailwind, colores o `tailwind.config.js`:**

  ```bash
  npm install      # solo la primera vez
  npm run build    # regenera assets/css/styles.css
  ```

  Para desarrollar con recarga: `npm run watch` y sirve la carpeta con `python3 -m http.server`.

## Pendiente de revisar (valores heredados de las páginas originales)

- [ ] Enlaces a **GitHub**: apuntan a `https://github.com` (busca `github.com` en `index.html`).
- [ ] **Logo:** se carga desde una URL de `googleusercontent.com` generada por la herramienta de diseño y podría caducar.
      Descárgalo a `assets/img/` y cambia el `src` (aparece 2 veces en `index.html`).
- [ ] **Fechas del roadmap** (Q2/Q3/Q4 2025) y **versión** (v0.9.4): ya son anteriores a hoy o están desfasadas.
- [ ] Enlace **Privacidad y términos** del pie: no lleva a ninguna página todavía (`href="#"`).
