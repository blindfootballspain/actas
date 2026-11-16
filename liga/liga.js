/* Web pública de las ligas: clasificaciones, resultados y goleadores a partir de data/liga.json */
(function () {
  'use strict';
  const L = LigaCore;
  const $ = (s, r = document) => r.querySelector(s);

  function el(tag, attrs, ...hijos) {
    const [nombre, ...resto] = tag.split(/(?=[.#])/);
    const n = document.createElement(nombre || 'div');
    resto.forEach((p) => (p[0] === '.' ? n.classList.add(p.slice(1)) : (n.id = p.slice(1))));
    if (attrs !== null && attrs !== undefined && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      hijos.unshift(attrs);
      attrs = null;
    }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    hijos.flat(Infinity).forEach((h) => h !== null && h !== undefined && h !== false && n.append(h instanceof Node ? h : document.createTextNode(String(h))));
    return n;
  }

  const S = { liga: null, torneo: null, sec: 'clasificacion', jornada: {}, filtroGol: {}, cargado: 0 };
  const SECCIONES = ['clasificacion', 'resultados', 'goleadores'];
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  /* ---------- Formato ---------- */
  const fecha = (iso, opts) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', opts);
  };
  const diaLargo = (iso) => (iso ? fecha(iso, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Fecha por determinar');
  const diaCorto = (iso) => fecha(iso, { day: '2-digit', month: 'short' }).replace('.', '');
  const hoyIso = () => new Date().toISOString().slice(0, 10);

  const torneo = () => S.liga.torneos.find((t) => t.id === S.torneo) || S.liga.torneos[0];
  const nombreEq = (t, id, corto) => {
    const e = id && L.equipo(t, id);
    return e ? (corto ? e.corto || e.nombre : e.nombre) : 'Por determinar';
  };
  const grupoDe = (t, comp) => (t.grupos.length > 1 ? (t.grupos.find((g) => g.id === comp) || { nombre: comp === 'fs2f' ? 'Fase final' : '' }).nombre : '');

  /* ---------- Carga de datos ---------- */
  async function cargar(forzar) {
    const btn = $('#recargar');
    btn.classList.add('girando');
    try {
      const r = await fetch('../data/liga.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const nueva = await r.json();
      const cambio = !S.liga || nueva.actualizado !== S.liga.actualizado;
      S.liga = nueva;
      S.cargado = Date.now();
      if (!cambio && !forzar) return;
    } catch {
      if (!S.liga) {
        $('#vista').replaceChildren(el('div.tarjeta', el('div.vacio', el('b', 'No se han podido cargar los datos'), 'Comprueba la conexión y vuelve a intentarlo.')));
        return;
      }
    } finally {
      btn.classList.remove('girando');
    }
    $('#temporada').textContent = 'Temporada ' + (S.liga.temporada || '').replace('-', '/') + ' · FEDC';
    leerRuta();
    pintar();
  }

  /* ---------- Rutas: #torneo/seccion ---------- */
  function leerRuta() {
    const [t, s] = location.hash.replace(/^#\/?/, '').split('/');
    const guardado = lsGet('ligas:torneo');
    S.torneo = S.liga.torneos.some((x) => x.id === t) ? t : S.liga.torneos.some((x) => x.id === guardado) ? guardado : S.liga.torneos[0].id;
    S.sec = SECCIONES.includes(s) ? s : 'clasificacion';
  }
  function ir(t, s) {
    const h = `#${t}/${s}`;
    if (location.hash !== h) history.pushState(null, '', h);
    S.torneo = t;
    S.sec = s;
    lsSet('ligas:torneo', t);
    pintar();
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('popstate', () => S.liga && (leerRuta(), pintar()));

  /* ---------- Pintado general ---------- */
  function pintar() {
    const t = torneo();
    $('#torneos').replaceChildren(
      ...S.liga.torneos.map((x) => el('button', { type: 'button', 'aria-current': String(x.id === t.id), onclick: () => ir(x.id, S.sec) }, x.corto))
    );
    document.querySelectorAll('.barra-inf a').forEach((a) => {
      a.href = `#${t.id}/${a.dataset.sec}`;
      if (a.dataset.sec === S.sec) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const titulos = { clasificacion: 'Clasificación', resultados: 'Resultados', goleadores: 'Goleadores' };
    document.title = `${titulos[S.sec]} · ${t.corto} · Ligas FEDC`;
    const v = $('#vista');
    v.replaceChildren();
    ({ clasificacion: vistaClasificacion, resultados: vistaResultados, goleadores: vistaGoleadores })[S.sec](v, t);
    v.append(el('div.pie-datos', 'Datos de las actas oficiales · Actualizado ' + new Date(S.liga.actualizado).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
  }
  document.querySelectorAll('.barra-inf a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      ir(S.torneo, a.dataset.sec);
    })
  );

  /* ---------- Clasificación ---------- */
  function vistaClasificacion(v, t) {
    const conGrupos = t.grupos.length > 1;
    t.grupos.forEach((g) => {
      const filas = L.clasificacion(S.liga, t, g.id);
      const jugados = filas.some((f) => f.pj > 0);
      const tarjeta = el('section.tarjeta', { 'aria-labelledby': 'cl-' + g.id });
      const ver = el('button.ver-mas', { type: 'button', 'aria-expanded': 'false' }, 'Ver todo');
      ver.addEventListener('click', () => {
        const ab = tarjeta.classList.toggle('completa');
        ver.textContent = ab ? 'Ver menos' : 'Ver todo';
        ver.setAttribute('aria-expanded', String(ab));
      });
      tarjeta.append(
        el('div.tarjeta-cab', el('h2#cl-' + g.id, conGrupos ? g.nombre : 'Clasificación'), jugados ? ver : el('small', 'Sin partidos jugados')),
        el(
          'div.tabla-wrap',
          el(
            'table.clasif',
            el('caption', { class: 'sr', hidden: true }, (conGrupos ? g.nombre + ' · ' : '') + 'Clasificación ' + t.nombre),
            el(
              'thead',
              el(
                'tr',
                el('th', { scope: 'col', title: 'Posición' }, '#'),
                el('th.eq', { scope: 'col' }, 'Equipo'),
                el('th', { scope: 'col', title: 'Partidos jugados' }, 'PJ'),
                el('th.det', { scope: 'col', title: 'Ganados' }, 'G'),
                el('th.det', { scope: 'col', title: 'Empatados' }, 'E'),
                el('th.det', { scope: 'col', title: 'Perdidos' }, 'P'),
                el('th.det', { scope: 'col', title: 'Goles a favor' }, 'GF'),
                el('th.det', { scope: 'col', title: 'Goles en contra' }, 'GC'),
                el('th', { scope: 'col', title: 'Diferencia de goles' }, 'DG'),
                el('th', { scope: 'col', title: 'Puntos' }, 'Pts'),
                el('th.det', { scope: 'col' }, 'Últimos')
              )
            ),
            el(
              'tbody',
              filas.map((f) =>
                el(
                  'tr' + (f.pos === 1 && jugados ? '.lider' : ''),
                  { onclick: () => fichaEquipo(t, f.id) },
                  el('td.pos', el('span', f.pos)),
                  el('td.eq', el('button', { type: 'button', title: f.nombre }, f.corto)),
                  el('td', f.pj),
                  el('td.det', f.g),
                  el('td.det', f.e),
                  el('td.det', f.p),
                  el('td.det', f.gf),
                  el('td.det', f.gc),
                  el('td', f.dg > 0 ? '+' + f.dg : f.dg),
                  el('td.pts', f.pts),
                  el('td.det', forma(f.forma))
                )
              )
            )
          )
        )
      );
      v.append(tarjeta);
    });

    // Fase final (eliminatorias)
    const rondas = t.jornadas.filter((j) => j.eliminatoria);
    if (rondas.length) {
      v.append(
        el(
          'section.tarjeta',
          el('div.tarjeta-cab', el('h2', 'Fase final')),
          el(
            'div.cuadro',
            rondas.map((j) => el('div.ronda', el('h3', j.nombre + (j.partidos[0] && j.partidos[0].fecha ? ' · ' + diaCorto(j.partidos[0].fecha) : '')), j.partidos.map((p) => tarjetaPartido(t, p, j, true))))
          )
        )
      );
    }
    v.append(el('p.leyenda', 'Victoria 3 puntos, empate 1. Empates a puntos: enfrentamientos directos, diferencia de goles y goles a favor.'));
  }

  const forma = (lista) => el('span.forma', { 'aria-label': 'Últimos resultados: ' + lista.map((x) => ({ V: 'victoria', E: 'empate', D: 'derrota' })[x]).join(', ') }, lista.map((x) => el('i.' + x, { 'aria-hidden': 'true' }, x)));

  /* ---------- Resultados ---------- */
  function jornadaPorDefecto(t) {
    const conRes = t.jornadas.filter((j) => j.partidos.some((p) => L.jugado(S.liga.resultados[p.id])));
    const proxima = t.jornadas.find((j) => j.partidos.some((p) => !S.liga.resultados[p.id] && (p.fecha || '9999') >= hoyIso()));
    if (conRes.length) {
      const ult = conRes[conRes.length - 1];
      // Si la última con resultados ya está completa y la próxima es inminente, mostrar la próxima
      const completa = ult.partidos.every((p) => S.liga.resultados[p.id]);
      return completa && proxima && proxima.n > ult.n ? proxima.n : ult.n;
    }
    return (proxima || t.jornadas[0]).n;
  }

  function vistaResultados(v, t) {
    const n = S.jornada[t.id] || jornadaPorDefecto(t);
    const idx = Math.max(0, t.jornadas.findIndex((j) => j.n === n));
    const j = t.jornadas[idx];
    const cambiar = (k) => {
      S.jornada[t.id] = t.jornadas[k].n;
      pintar();
    };
    const lista = el(
      'div.lista-jornadas',
      { role: 'tablist', 'aria-label': 'Jornadas' },
      t.jornadas.map((x, k) => {
        const hecha = x.partidos.length && x.partidos.every((p) => S.liga.resultados[p.id]);
        const corto = x.eliminatoria ? x.nombre.replace('Cuartos de final', 'Cuartos') : 'J' + x.n;
        return el(
          'button' + (hecha ? '.hecha' : ''),
          { type: 'button', role: 'tab', 'aria-current': String(k === idx), 'aria-label': x.nombre, onclick: () => cambiar(k) },
          corto,
          el('small', diaCorto(x.partidos[0] && x.partidos[0].fecha) || '—')
        );
      })
    );
    v.append(
      el(
        'div.jornadas',
        el('button.flecha', { type: 'button', 'aria-label': 'Jornada anterior', disabled: idx === 0 || null, onclick: () => cambiar(idx - 1) }, '‹'),
        lista,
        el('button.flecha', { type: 'button', 'aria-label': 'Jornada siguiente', disabled: idx === t.jornadas.length - 1 || null, onclick: () => cambiar(idx + 1) }, '›')
      ),
      el('h2', { style: 'font-size:1.15rem;margin:4px 4px 0' }, j.nombre)
    );
    requestAnimationFrame(() => {
      const b = lista.children[idx];
      if (b) lista.scrollLeft = b.offsetLeft - lista.clientWidth / 2 + b.clientWidth / 2;
    });

    const porDia = {};
    j.partidos.forEach((p) => (porDia[p.fecha || ''] = porDia[p.fecha || ''] || []).push(p));
    Object.keys(porDia)
      .sort()
      .forEach((d) => {
        v.append(el('h3.dia', diaLargo(d)));
        porDia[d].forEach((p) => v.append(tarjetaPartido(t, p, j)));
      });
    if (j.descansan && j.descansan.length) v.append(el('p.descansa', 'Descansa: ' + j.descansan.map((d) => nombreEq(t, d.equipo)).join(' · ')));
  }

  function tarjetaPartido(t, p, j, sinGrupo) {
    const r = S.liga.resultados[p.id];
    const ok = L.jugado(r);
    let centro;
    if (ok) centro = el('div.marcador', { 'aria-label': `Resultado ${r.gl} a ${r.gv}` }, `${r.gl} – ${r.gv}`);
    else if (r && r.estado) centro = el('div.marcador.estado', r.estado);
    else centro = el('div.marcador.pend', p.hora || 'vs');
    const cl = (a, b) => (!ok ? '' : a > b ? '.gana' : a < b ? '.pierde' : '');
    const grupo = sinGrupo ? '' : grupoDe(t, p.comp);
    const lugar = [p.instalacion, p.sede].filter(Boolean).join(' · ');
    return el(
      'button.partido',
      { type: 'button', onclick: () => fichaPartido(t, p, j) },
      grupo || lugar || (r && r.nota) ? el('div.meta', grupo ? el('span.chip', grupo) : null, el('span.lugar', lugar), r && r.nota ? el('span.chip.chip-amarillo', 'Nota') : null) : null,
      el('div.duelo', el('span.eq.l' + cl(r && r.gl, r && r.gv), nombreEq(t, p.local)), centro, el('span.eq' + cl(r && r.gv, r && r.gl), nombreEq(t, p.visitante)))
    );
  }

  /* ---------- Goleadores ---------- */
  function vistaGoleadores(v, t) {
    let lista = L.goleadores(S.liga, t);
    const filtro = S.filtroGol[t.id] || '';
    if (filtro) {
      lista = lista.filter((g) => (L.equipo(t, g.equipo) || {}).grupo === filtro);
      let pos = 0, ant = null;
      lista.forEach((x, i) => (x.goles !== ant ? ((pos = i + 1), (ant = x.goles)) : 0, (x.pos = pos)));
    }
    const tarjeta = el('section.tarjeta', el('div.tarjeta-cab', el('h2', 'Máximos goleadores'), el('small', t.corto)));
    if (t.grupos.length > 1)
      tarjeta.append(
        el(
          'div.filtro',
          [{ id: '', nombre: 'Todos' }, ...t.grupos].map((g) =>
            el('button', { type: 'button', 'aria-pressed': String(filtro === g.id), onclick: () => ((S.filtroGol[t.id] = g.id), pintar()) }, g.nombre)
          )
        )
      );
    if (!lista.length) tarjeta.append(el('div.vacio', el('b', 'Todavía no hay goles registrados'), 'Aparecerán en cuanto se publiquen las primeras actas.'));
    else
      tarjeta.append(
        el(
          'ol.gol-lista',
          lista.map((g) =>
            el(
              'li' + (g.pos === 1 ? '.top' : ''),
              el('span.p', g.pos === 1 ? el('span', '1') : g.pos),
              el('span.n', el('b', g.nombre), el('small', nombreEq(t, g.equipo) + ' · ' + g.partidos + (g.partidos === 1 ? ' partido con gol' : ' partidos con gol'))),
              el('span.g', { 'aria-label': g.goles + (g.goles === 1 ? ' gol' : ' goles') }, g.goles)
            )
          )
        )
      );
    v.append(tarjeta);
  }

  /* ---------- Fichas ---------- */
  const hoja = $('#hoja');
  $('.hoja-cerrar').addEventListener('click', () => hoja.close());
  hoja.addEventListener('click', (e) => e.target === hoja && hoja.close());
  function abrirHoja(...contenido) {
    $('#hoja-contenido').replaceChildren(...contenido.filter(Boolean));
    if (!hoja.open) hoja.showModal();
    hoja.scrollTop = 0;
  }

  function fichaPartido(t, p, j) {
    const r = S.liga.resultados[p.id];
    const ok = L.jugado(r);
    const golesDe = (eq) => (r && r.goles ? r.goles.filter((g) => g.equipo === eq) : []);
    const lista = (eq, pp) =>
      el(
        'ul',
        golesDe(eq).map((g) => el('li', g.nombre, g.goles > 1 ? el('span.x', ' ×' + g.goles) : null)),
        pp ? el('li.pp', pp + (pp === 1 ? ' gol en propia puerta' : ' goles en propia puerta')) : null
      );
    const grupo = grupoDe(t, p.comp);
    abrirHoja(
      el('div.hoja-cab', el('small', [t.corto, grupo, j.nombre].filter(Boolean).join(' · ')), el('h2#hoja-titulo', ok ? 'Resultado final' : r && r.estado ? 'Partido ' + r.estado : 'Próximo partido')),
      el(
        'div.hoja-duelo',
        el('div.eq', nombreEq(t, p.local)),
        ok ? el('div.marcador', `${r.gl} – ${r.gv}`) : el('div.marcador.pend', p.hora || 'vs'),
        el('div.eq', nombreEq(t, p.visitante))
      ),
      ok && (r.goles.length || (r.pp && (r.pp.local || r.pp.visitante)))
        ? el('div.hoja-sec', el('h3', 'Goles'), el('div.goles-2', lista(p.local, r.pp && r.pp.local), lista(p.visitante, r.pp && r.pp.visitante)))
        : null,
      el(
        'div.hoja-sec',
        el('h3', 'Datos del partido'),
        el(
          'dl.datos',
          el('dt', 'Fecha'), el('dd', p.fecha ? diaLargo(p.fecha) + (p.hora ? ' · ' + p.hora : '') : 'Por determinar'),
          p.sede ? [el('dt', 'Sede'), el('dd', p.sede)] : null,
          p.instalacion ? [el('dt', 'Instalación'), el('dd', p.instalacion)] : null,
          p.direccion ? [el('dt', 'Dirección'), el('dd', p.direccion)] : null,
          r && r.acta && r.acta.numero ? [el('dt', 'Acta'), el('dd', r.acta.numero)] : null
        ),
        r && r.nota ? el('div.nota-pub', r.nota) : null
      )
    );
  }

  function fichaEquipo(t, id) {
    const e = L.equipo(t, id);
    const fila = L.clasificacion(S.liga, t, e.grupo).find((f) => f.id === id);
    const grupo = t.grupos.length > 1 ? (t.grupos.find((g) => g.id === e.grupo) || {}).nombre : '';
    const goleadores = L.goleadores(S.liga, t).filter((g) => g.equipo === id);
    const suyos = [];
    t.jornadas.forEach((j) => j.partidos.forEach((p) => (p.local === id || p.visitante === id) && suyos.push({ p, j })));
    abrirHoja(
      el('div.hoja-cab', el('small', [t.corto, grupo].filter(Boolean).join(' · ')), el('h2#hoja-titulo', e.nombre)),
      fila
        ? el('div.hoja-sec', el('div.stats', el('div', el('b', fila.pos + 'º'), el('small', 'Posición')), el('div', el('b', fila.pts), el('small', 'Puntos')), el('div', el('b', `${fila.g}-${fila.e}-${fila.p}`), el('small', 'G-E-P')), el('div', el('b', `${fila.gf}:${fila.gc}`), el('small', 'Goles'))))
        : null,
      goleadores.length
        ? el('div.hoja-sec', el('h3', 'Goleadores'), el('ol.gol-lista', goleadores.map((g) => el('li', el('span.p', ''), el('span.n', el('b', g.nombre)), el('span.g', g.goles)))))
        : null,
      el(
        'div.hoja-sec',
        el('h3', 'Partidos'),
        el(
          'div.mini-partidos',
          suyos.map(({ p, j }) => {
            const r = S.liga.resultados[p.id];
            const ok = L.jugado(r);
            const local = p.local === id;
            const rival = nombreEq(t, local ? p.visitante : p.local);
            let res = null;
            if (ok) {
              const a = local ? r.gl : r.gv, b = local ? r.gv : r.gl;
              res = forma([a > b ? 'V' : a < b ? 'D' : 'E']);
            }
            return el(
              'button',
              { type: 'button', onclick: () => fichaPartido(t, p, j) },
              el('span.f', j.eliminatoria ? j.nombre.split(' ')[0] : 'J' + j.n, el('br'), diaCorto(p.fecha)),
              el('span', (local ? 'vs ' : 'en ') + rival),
              el('span.r', ok ? `${r.gl} – ${r.gv}` : r && r.estado ? r.estado : p.hora || ''),
              res || el('span')
            );
          })
        )
      )
    );
  }

  /* ---------- Arranque ---------- */
  $('#recargar').addEventListener('click', () => cargar(true));
  // Los resultados se publican al cerrar cada acta: se comprueba si hay novedades cada 2 minutos
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - S.cargado > 60 * 1000) cargar(false);
  });
  setInterval(() => document.visibilityState === 'visible' && !$('#hoja').open && cargar(false), 2 * 60 * 1000);
  cargar(false);
})();
