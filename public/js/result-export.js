/**
 * Export du résultat en image PNG (carte 1080×1350) : SVG composé côté client → canvas → partage ou téléchargement.
 */
(function () {
  'use strict';
  const btn = document.getElementById('download');
  const dataEl = document.getElementById('result-data');
  const K = window.AvatarKit;
  if (!btn || !dataEl || !K) return;
  const data = JSON.parse(dataEl.textContent);
  const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function buildSvg() {
    const W = 1080; const H = 1350;
    const avatar = K.renderAvatar(data.avatar, { expression: data.expression, background: false, id: 'exp-av' });
    const order = [data.dims[1], data.dims[0], data.dims[2], data.dims[3]];
    const blobs = order.map((d, i) => {
      const dim = data.dimensions[d];
      const top = i === 1;
      const size = top ? 300 : 220;
      const x = 60 + i * 250 + (250 - size) / 2;
      const y = 720 + (top ? 0 : 60);
      const blob = K.renderBlob({ color: dim.color, face: dim.face, id: 'exp-b' + i, label: dim.name });
      return `<g transform="translate(${x} ${y})"><svg width="${size}" height="${size}" viewBox="0 0 120 120">${blob.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg></g>
        <text x="${x + size / 2}" y="${y + size + (top ? 30 : 24)}" text-anchor="middle" font-family="${FONT}" font-size="${top ? 64 : 48}" font-weight="800" fill="${dim.chart}">${data.scores[d]}</text>`;
    }).join('');
    const kw = data.keywords.slice(0, 6).map(esc).join('  ✦  ');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <radialGradient id="exp-halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${data.color}" stop-opacity=".75"/><stop offset="1" stop-color="${data.color}" stop-opacity="0"/></radialGradient>
        <linearGradient id="exp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE6FF"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>
        <linearGradient id="exp-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="#FFFFFF"/>
      <rect width="${W}" height="420" fill="url(#exp-sky)"/>
      <text x="${W / 2}" y="92" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="700" letter-spacing="4" fill="#6B6E78">RÉSULTAT DU TEST · ${esc(data.firstName).toUpperCase()}</text>
      <text x="${W / 2}" y="168" text-anchor="middle" font-family="${FONT}" font-size="78" font-weight="800" fill="#1C1D22">${esc(data.profileName)}</text>
      <circle cx="${W / 2}" cy="470" r="260" fill="url(#exp-halo)"/>
      <g transform="translate(240 190)"><svg width="600" height="600" viewBox="0 0 400 400">${avatar.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg></g>
      <rect x="0" y="590" width="${W}" height="202" fill="url(#exp-fade)"/>
      ${blobs}
      <text x="${W / 2}" y="1160" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="500" fill="#6B6E78">${kw}</text>
      ${data.tagline ? `<text x="${W / 2}" y="1215" text-anchor="middle" font-family="${FONT}" font-size="28" font-style="italic" fill="#9B9DA6">${esc(data.tagline)}</text>` : ''}
      <text x="${W / 2}" y="1290" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="700" letter-spacing="2" fill="#9B9DA6">${esc(data.appName).toUpperCase()}</text>
    </svg>`;
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  btn.addEventListener('click', () => {
    btn.disabled = true;
    const svg = buildSvg();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1350;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        btn.disabled = false;
        if (!png) return;
        const name = `profil-disc-${data.firstName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        const file = new File([png], name, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: `Mon profil DISC : ${data.profileName}` }).catch(() => download(png, name));
        } else {
          download(png, name);
        }
      }, 'image/png');
    };
    img.onerror = () => { btn.disabled = false; alert('Impossible de générer l\'image.'); };
    img.src = url;
  });
}());
