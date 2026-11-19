// Genera páginas estáticas de contenido (para SEO) a partir de js/data/kb.js y js/data/parts.js.
// Uso: node tools/build-pages.mjs
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = 'https://conocetubici.vercel.app';
const TODAY = new Date().toISOString().slice(0, 10);
const load = (f, n) => new Function(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/export const/g, 'const') + `;return ${n}`)();
const KB = load('js/data/kb.js', 'KB');
const PARTS = load('js/data/parts.js', 'PARTS');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const partName = k => (PARTS[k] ? PARTS[k].nombre : null);

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

function page({ url, title, desc, h1, body, jsonld = [], crumbs }) {
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] })) },
    ...jsonld,
  ];
  const trail = crumbs.map((c, i) => (i < crumbs.length - 1 ? `<a href="${c[1]}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`)).join(' › ');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta name="theme-color" content="#f2efe8">
<meta property="og:type" content="article">
<meta property="og:locale" content="es_CL">
<meta property="og:site_name" content="Conoce tu bici">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${url}">
<meta property="og:image" content="${SITE}/Bici.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">
<script type="application/ld+json">
${JSON.stringify(ld)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/content.css">
</head>
<body>
<header class="top"><a class="logo" href="/">Conoce tu bici</a>
<nav><a href="/partes-de-una-bicicleta/">Partes</a><a href="/como-funcionan-los-cambios/">Cambios</a><a href="/como-arreglar-una-bicicleta/">Arreglar</a><a class="cta" href="/">Ver en 3D</a></nav></header>
<main>
<nav class="crumbs" aria-label="Ruta">${trail}</nav>
<h1>${esc(h1)}</h1>
${body}
<aside class="app-cta"><strong>¿Prefieres verlo en 3D?</strong> Gira la bicicleta, toca cada pieza y sigue las guías interactivas. <a href="/">Abrir «Conoce tu bici»</a></aside>
</main>
<footer><p>«Conoce tu bici» es una aplicación gratuita y en español para aprender las partes de una bicicleta y cómo repararla. <a href="/">Inicio</a> · <a href="/partes-de-una-bicicleta/">Partes</a> · <a href="/como-funcionan-los-cambios/">Cambios</a> · <a href="/como-arreglar-una-bicicleta/">Guías de reparación</a></p></footer>
</body>
</html>
`;
}

const urls = [];
function write(url, html) {
  const dir = path.join(ROOT, url.replace(/^\//, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  urls.push(url);
}

// ---- Guías de reparación ----
const used = new Set();
const guides = KB.map(g => {
  let s = slug(g.titulo), n = 2;
  while (used.has(s)) s = slug(g.titulo) + '-' + n++;
  used.add(s);
  return { ...g, slug: s, url: `/arreglar/${s}/` };
});

for (const g of guides) {
  const pn = partName(g.parte);
  const rel = guides.filter(x => x !== g && x.parte === g.parte).slice(0, 6);
  const body = `
<p class="lead">${esc(g.diagnostico)}</p>
<h2>Qué necesitas</h2>
<ul>${g.herramientas.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
<h2>Paso a paso</h2>
<ol class="steps">${g.pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
<h2>Cuándo llevarla al taller</h2>
<p>${esc(g.taller)}</p>
${pn ? `<h2>Pieza relacionada</h2><p>Aprende qué hace y cómo funciona: <a href="/partes/${g.parte}/">${esc(pn)}</a>.</p>` : ''}
${rel.length ? `<h2>Otras guías relacionadas</h2><ul>${rel.map(r => `<li><a href="${r.url}">${esc(r.titulo)}</a></li>`).join('')}</ul>` : ''}`;
  write(g.url, page({
    url: g.url,
    title: `${g.titulo}: guía paso a paso | Conoce tu bici`,
    desc: cut(`${g.titulo}: ${g.diagnostico} Guía paso a paso, herramientas necesarias y cuándo ir al taller.`, 158),
    h1: g.titulo,
    body,
    crumbs: [['Inicio', '/'], ['Cómo arreglar una bicicleta', '/como-arreglar-una-bicicleta/'], [g.titulo, g.url]],
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'HowTo', name: g.titulo, description: g.diagnostico, inLanguage: 'es',
      tool: g.herramientas.map(t => ({ '@type': 'HowToTool', name: t })),
      step: g.pasos.map((p, i) => ({ '@type': 'HowToStep', position: i + 1, text: p })),
    }],
  }));
}

const byPart = {};
for (const g of guides) (byPart[g.parte] ||= []).push(g);
write('/como-arreglar-una-bicicleta/', page({
  url: '/como-arreglar-una-bicicleta/',
  title: 'Cómo arreglar una bicicleta: guías paso a paso | Conoce tu bici',
  desc: `${guides.length} guías en español para arreglar tu bicicleta: pinchazos, cadena, frenos, cambios, ruedas, manubrio y más. Con herramientas y pasos claros.`,
  h1: 'Cómo arreglar una bicicleta: guías paso a paso',
  crumbs: [['Inicio', '/'], ['Cómo arreglar una bicicleta', '/como-arreglar-una-bicicleta/']],
  body: `<p class="lead">Guías prácticas y en español para resolver los problemas más comunes de tu bici sin ser mecánico. Cada una indica las herramientas, los pasos y cuándo conviene ir a un taller.</p>
${Object.keys(byPart).map(k => `<h2>${esc(partName(k) || k)}</h2><ul>${byPart[k].map(g => `<li><a href="${g.url}">${esc(g.titulo)}</a></li>`).join('')}</ul>`).join('\n')}`,
}));

// ---- Partes ----
const keys = Object.keys(PARTS);
for (const k of keys) {
  const p = PARTS[k], url = `/partes/${k}/`;
  const nm = p.nombre.replace(/\s*\(.*?\)/, '');
  const gs = byPart[k] || [];
  write(url, page({
    url,
    title: `${nm} de una bicicleta: qué es, cómo funciona y problemas | Conoce tu bici`,
    desc: cut(`${p.que} Descubre cómo funciona y cómo resolver sus problemas más comunes.`, 158),
    h1: `${nm} de una bicicleta`,
    crumbs: [['Inicio', '/'], ['Partes de una bicicleta', '/partes-de-una-bicicleta/'], [p.nombre, url]],
    body: `<h2>Qué es</h2><p>${esc(p.que)}</p>
<h2>Cómo funciona</h2><p>${esc(p.como)}</p>
<h2>Problemas comunes y soluciones</h2>
<dl>${p.prob.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
${gs.length ? `<h2>Guías de reparación</h2><ul>${gs.map(g => `<li><a href="${g.url}">${esc(g.titulo)}</a></li>`).join('')}</ul>` : ''}
<p><a href="/partes-de-una-bicicleta/">← Ver todas las partes de una bicicleta</a></p>`,
  }));
}
write('/partes-de-una-bicicleta/', page({
  url: '/partes-de-una-bicicleta/',
  title: 'Partes de una bicicleta: nombres, funciones y cómo funcionan | Conoce tu bici',
  desc: `Conoce las ${keys.length} partes de una bicicleta: cuadro, horquilla, frenos, cadena, cassette, desviadores y más. Qué hace cada una y qué problemas da.`,
  h1: 'Partes de una bicicleta y para qué sirve cada una',
  crumbs: [['Inicio', '/'], ['Partes de una bicicleta', '/partes-de-una-bicicleta/']],
  body: `<p class="lead">Una bicicleta parece simple, pero cada pieza cumple una función. Aquí tienes todas las partes, qué hacen y cómo se relacionan. Para verlas en 3D, <a href="/">abre la aplicación</a>.</p>
${keys.map(k => `<h2><a href="/partes/${k}/">${esc(PARTS[k].nombre)}</a></h2><p>${esc(PARTS[k].que)}</p>`).join('\n')}`,
}));

// ---- Cambios ----
write('/como-funcionan-los-cambios/', page({
  url: '/como-funcionan-los-cambios/',
  title: 'Cómo funcionan los cambios de una bicicleta: platos y piñones | Conoce tu bici',
  desc: 'Entiende cómo funcionan los cambios de una bicicleta: platos, piñones, relación de transmisión y qué marcha usar en subidas, bajadas y plano.',
  h1: 'Cómo funcionan los cambios de una bicicleta',
  crumbs: [['Inicio', '/'], ['Cómo funcionan los cambios', '/como-funcionan-los-cambios/']],
  body: `<p class="lead">Los cambios te permiten elegir cuánto esfuerzo haces por pedalada y cuánta distancia avanzas. Funcionan combinando los platos (adelante, junto a los pedales) con los piñones (atrás, en la rueda trasera).</p>
<h2>Platos y piñones</h2>
<p>La cadena une un plato delantero con un piñón trasero. Los desviadores empujan la cadena de un plato o piñón a otro cuando accionas las manetas. Un plato grande o un piñón pequeño dan una marcha «dura»; un plato pequeño o un piñón grande dan una marcha «blanda».</p>
<h2>La relación de transmisión</h2>
<p>Se calcula dividiendo los dientes del plato por los dientes del piñón. Por ejemplo, un plato de 42 dientes con un piñón de 14 da una relación de 3: la rueda trasera da 3 vueltas por cada pedalada completa. Con un plato de 28 y un piñón de 28 la relación es 1: una vuelta de rueda por pedalada, ideal para subir.</p>
<h2>Qué marcha usar</h2>
<ul>
<li><strong>Subidas:</strong> plato pequeño y piñón grande. Pedaleas más liviano y con más vueltas por minuto.</li>
<li><strong>Plano:</strong> plato y piñón medios, buscando un ritmo cómodo de pedaleo.</li>
<li><strong>Bajadas o viento a favor:</strong> plato grande y piñón pequeño para aprovechar la velocidad.</li>
</ul>
<h2>Cuántos cambios tiene tu bici</h2>
<p>Se multiplican los platos por los piñones: 3 platos y 7 piñones dan 21 combinaciones, aunque algunas se repiten o fuerzan la cadena. Evita los cruces extremos, como plato grande con piñón grande.</p>
<h2>Consejos para cambiar bien</h2>
<ul>
<li>Cambia antes de la subida, no en medio, y sigue pedaleando mientras cambias.</li>
<li>No cambies con mucha fuerza sobre los pedales.</li>
<li>Si los cambios saltan o hacen ruido, revisa la <a href="/arreglar/ajustar-los-cambios/">guía para ajustar los cambios</a>.</li>
</ul>
<p>Piezas relacionadas: <a href="/partes/cassette/">cassette</a>, <a href="/partes/desviador/">desviador trasero</a>, <a href="/partes/desviador_del/">desviador delantero</a>, <a href="/partes/bielas/">bielas y platos</a> y <a href="/partes/cadena/">cadena</a>.</p>`,
}));

// ---- Sitemap ----
const entries = ['/', ...urls.sort()];
const depth = u => u.split('/').filter(Boolean).length;
const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(u => `  <url>
    <loc>${SITE}${u}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${u === '/' ? '1.0' : depth(u) === 1 ? '0.8' : '0.6'}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm);
console.log(`Generadas ${urls.length} páginas.`);
