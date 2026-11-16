/*
 * Administración · Liga y resultados.
 * - Con la publicación automática activada, cada cambio se guarda directamente en GitHub
 *   (data/liga.json) y aparece en la web pública. Los árbitros publican al cerrar el acta.
 * - Sin ella, funciona como antes: se descarga liga.json y se sube a mano.
 */
(function (global) {
  'use strict';
  const { el, aviso, dialogo, confirmar, descargar, fechaCorta } = U;
  const L = LigaCore;
  const CLAVE_BORRADOR = 'actas-fedc:liga-borrador';
  const RUTA = 'data/liga.json';

  const S = { liga: null, base: null, cambios: false, torneo: null, raiz: null, cargando: null, cfg: () => null, guardando: false };

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const enLinea = () => GitHub.configurado(S.cfg());

  /* ================= Carga y guardado ================= */
  async function cargar() {
    if (enLinea()) {
      try {
        const r = await GitHub.leer(S.cfg(), RUTA);
        S.liga = r.datos;
        S.base = S.liga && S.liga.actualizado;
        lsSet(CLAVE_BORRADOR, null);
      } catch (e) {
        aviso('No se pudo leer la liga desde GitHub: ' + e.message, 'error', 6000);
      }
    }
    if (!S.liga) {
      try {
        const r = await fetch('data/liga.json?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) S.liga = await r.json();
      } catch {}
      S.base = S.liga ? S.liga.actualizado : null;
      if (!enLinea()) await recuperarBorrador();
    }
    if (S.liga) S.torneo = S.torneo || S.liga.torneos[0].id;
  }

  async function recuperarBorrador() {
    const b = lsGet(CLAVE_BORRADOR);
    if (!b) return;
    try {
      const borr = JSON.parse(b);
      if (borr.liga && (borr.base === S.base || !S.liga)) {
        const ok = await confirmar('Cambios sin publicar', 'Hay cambios de la liga de una sesión anterior que no se llegaron a publicar (' + U.fechaLarga(borr.liga.actualizado) + '). ¿Recuperarlos?', 'Recuperar');
        if (ok) (S.liga = borr.liga), (S.cambios = true);
        else lsSet(CLAVE_BORRADOR, null);
      } else lsSet(CLAVE_BORRADOR, null);
    } catch {
      lsSet(CLAVE_BORRADOR, null);
    }
  }

  /**
   * Aplica un cambio a la liga. `cambiar(liga)` recibe la versión más reciente
   * (en modo automático se relee de GitHub, por si un árbitro acaba de publicar).
   */
  async function guardar(cambiar, mensaje, textoOk) {
    if (enLinea()) {
      S.guardando = true;
      pintar();
      try {
        const r = await GitHub.actualizar(
          S.cfg(),
          RUTA,
          (liga) => {
            if (!liga) throw new Error('No hay liga.json en el repositorio.');
            if (cambiar(liga) === false) return false;
            liga.actualizado = new Date().toISOString();
            return liga;
          },
          mensaje
        );
        S.liga = r.datos;
        S.base = S.liga.actualizado;
        aviso(textoOk || 'Guardado y publicado en la web.');
      } catch (e) {
        aviso('No se pudo guardar: ' + e.message, 'error', 7000);
      } finally {
        S.guardando = false;
        pintar();
      }
    } else {
      if (cambiar(S.liga) === false) return;
      S.cambios = true;
      S.liga.actualizado = new Date().toISOString();
      lsSet(CLAVE_BORRADOR, JSON.stringify({ base: S.base, liga: S.liga }));
      if (textoOk) aviso(textoOk + ' Recuerda descargar y subir liga.json.');
      pintar();
    }
  }

  async function recargar() {
    S.liga = null;
    S.cargando = cargar();
    await S.cargando;
    S.cargando = null;
    pintar();
  }

  /* ================= Lectura de actas PDF ================= */
  async function leerPdf(file) {
    const { PDFDocument, PDFName, PDFDict, PDFArray, decodePDFRawStream } = PDFLib;
    const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
    const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    const ef = names && names.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
    if (!ef) throw new Error('El PDF no contiene los datos del acta (¿es un acta generada por la aplicación?).');
    const encontrados = [];
    const recorrer = (nodo) => {
      const kids = nodo.lookupMaybe(PDFName.of('Kids'), PDFArray);
      if (kids) for (let i = 0; i < kids.size(); i++) recorrer(kids.lookup(i, PDFDict));
      const arr = nodo.lookupMaybe(PDFName.of('Names'), PDFArray);
      if (arr)
        for (let i = 0; i < arr.size(); i += 2) {
          const nombre = arr.lookup(i).decodeText();
          if (!/^acta-.*\.json$/i.test(nombre)) continue;
          const spec = arr.lookup(i + 1, PDFDict);
          const flujo = spec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'));
          encontrados.push(new TextDecoder().decode(decodePDFRawStream(flujo).decode()));
        }
    };
    recorrer(ef);
    if (!encontrados.length) throw new Error('El PDF no contiene los datos del acta.');
    return JSON.parse(encontrados[0]);
  }

  const nombreEq = (torneo, id) => (id ? (L.equipo(torneo, id) || {}).nombre || '?' : 'Por determinar');
  const etiqueta = (torneo, p) => `${p.nombreJornada} · ${fechaCorta(p.fecha) || 's/f'} · ${nombreEq(torneo, p.local)} – ${nombreEq(torneo, p.visitante)}`;
  const opcionesPartido = (torneo, comp, elegido) =>
    L.partidos(torneo)
      .filter((p) => !comp || p.comp === comp)
      .map((p) => el('option', { value: p.id, selected: p.id === elegido }, etiqueta(torneo, p) + (S.liga.resultados[p.id] ? '  ✓' : '')));

  /** Coloca un resultado (en orientación del acta) en el partido elegido por la organización. */
  function colocarElegido(liga, partidoId, resultadoActa, locActa, visActa, extra = {}) {
    const p = L.buscarPartido(liga, partidoId);
    if (!p) return;
    const invertido = p.local && p.visitante && p.local === visActa && p.visitante === locActa;
    const r = JSON.parse(JSON.stringify(resultadoActa));
    if (invertido) {
      [r.gl, r.gv] = [r.gv, r.gl];
      r.pp = { local: r.pp.visitante, visitante: r.pp.local };
    }
    L.colocarResultado(liga, partidoId, r, { local: locActa, visitante: visActa, ...extra });
  }

  async function subirActas(files) {
    if (!files.length) return;
    const filas = [];
    for (const file of files) {
      const f = { file, acta: null, error: null, asign: null, elegido: '' };
      try {
        f.acta = await leerPdf(file);
        if (f.acta.estado !== 'cerrada') f.error = 'El acta no está cerrada.';
        else {
          f.asign = L.asignarActa(S.liga, f.acta);
          if (f.asign.error) f.error = f.asign.error;
          else f.elegido = f.asign.partido.id;
        }
      } catch (e) {
        f.error = e.message || 'No se pudo leer el PDF.';
      }
      filas.push(f);
    }
    const usados = {};
    filas.forEach((f) => f.elegido && (usados[f.elegido] = (usados[f.elegido] || 0) + 1));

    const cuerpo = el('div.import-lista');
    filas.forEach((f) => {
      const a = f.acta;
      const torneo = f.asign && f.asign.torneo;
      const existente = f.elegido && S.liga.resultados[f.elegido];
      const avisos = [
        ...((f.asign && f.asign.avisos) || []),
        existente ? (existente.acta && existente.acta.numero === a.numero ? 'Esta acta ya estaba publicada; se volverá a cargar.' : 'Este partido ya tenía resultado; se sustituirá.') : null,
        f.elegido && usados[f.elegido] > 1 ? 'Hay otra acta de esta subida asignada al mismo partido.' : null,
      ].filter(Boolean);
      cuerpo.append(
        el(
          'div.import-item' + (f.error ? '.mal' : avisos.length ? '.atencion' : '.bien'),
          el('div.import-cab', el('b', f.file.name), a ? el('span.chip', a.numero) : null),
          a ? el('div.import-marcador', `${a.local.nombre} ${a.resultado.local} – ${a.resultado.visitante} ${a.visitante.nombre}`) : null,
          f.error ? el('div.nota.nota-error', f.error) : null,
          avisos.map((x) => el('div.nota.nota-alerta', x)),
          a && torneo
            ? el('label.campo', el('span', 'Partido del calendario'), el('select', { onchange: (e) => (f.elegido = e.target.value) }, el('option', { value: '' }, '— No importar —'), opcionesPartido(torneo, a.competicion, f.elegido)))
            : null
        )
      );
    });
    const ok = await dialogo({
      titulo: 'Importar ' + filas.length + (filas.length === 1 ? ' acta' : ' actas'),
      cuerpo: [el('p.ayuda', 'Revisa a qué partido se asigna cada acta. Puedes cambiarlo en el desplegable.'), cuerpo],
      botones: [{ texto: 'Cancelar', valor: false }, { texto: enLinea() ? 'Importar y publicar' : 'Importar', valor: true, primario: true }],
    });
    if (!ok) return;
    const validas = filas.filter((f) => f.acta && f.elegido && f.acta.estado === 'cerrada');
    if (!validas.length) return;
    await guardar(
      (liga) => {
        validas.forEach((f) => {
          const as = L.asignarActa(liga, f.acta);
          colocarElegido(liga, f.elegido, L.resultadoDesdeActa(liga, f.acta, false), as.loc, as.vis, { hora: f.acta.partido.hora, instalacion: f.acta.partido.instalacion });
        });
      },
      'Importar ' + validas.map((f) => f.acta.numero).join(', '),
      validas.length + (validas.length === 1 ? ' acta importada.' : ' actas importadas.')
    );
  }

  /* ================= Actas pendientes de revisar ================= */
  function tarjetaPendientes() {
    const lista = S.liga.pendientes || [];
    if (!lista.length) return null;
    return el(
      'div.tarjeta.pendientes',
      el('h2', 'Actas pendientes de revisar (' + lista.length + ')'),
      el('p.ayuda', 'Estas actas llegaron de los árbitros pero no se han publicado automáticamente. Elige el partido y publícalas, o descártalas.'),
      lista.map((pen) => {
        const torneo = L.torneoDeComp(S.liga, pen.competicion);
        const sel = torneo ? el('select', el('option', { value: '' }, 'Elige el partido…'), opcionesPartido(torneo, pen.competicion, pen.partidoSugerido)) : null;
        return el(
          'div.import-item.atencion',
          el('div.import-cab', el('b', `${pen.local.nombre} ${pen.resultado.gl} – ${pen.resultado.gv} ${pen.visitante.nombre}`), el('span.chip', pen.numero)),
          el('div.ayuda', [pen.fecha && 'Partido del ' + fechaCorta(pen.fecha), 'recibida ' + U.fechaLarga(pen.recibida)].filter(Boolean).join(' · ')),
          el('div.nota.nota-alerta', pen.motivo),
          sel ? el('label.campo', el('span', 'Partido del calendario'), sel) : null,
          el(
            'div.fila-botones',
            el('button.btn.btn-peq.btn-primario', {
              disabled: !sel || S.guardando || null,
              onclick: () => {
                if (!sel.value) return aviso('Elige el partido.', 'alerta');
                const destino = sel.value;
                guardar(
                  (liga) => {
                    const actual = (liga.pendientes || []).find((x) => x.numero === pen.numero);
                    if (!actual) return false;
                    colocarElegido(liga, destino, actual.resultado, actual.local.equipoId, actual.visitante.equipoId, { hora: actual.hora, instalacion: actual.instalacion });
                    liga.pendientes = liga.pendientes.filter((x) => x.numero !== pen.numero);
                  },
                  'Publicar acta revisada ' + pen.numero,
                  'Acta publicada.'
                );
              },
            }, 'Publicar en este partido'),
            el('button.btn.btn-peq.btn-peligro', {
              disabled: S.guardando || null,
              onclick: async () => {
                if (!(await confirmar('Descartar acta', `Se descartará el acta ${pen.numero}. No se publicará ningún resultado.`, 'Descartar', true))) return;
                guardar((liga) => void (liga.pendientes = (liga.pendientes || []).filter((x) => x.numero !== pen.numero)), 'Descartar acta ' + pen.numero, 'Acta descartada.');
              },
            }, 'Descartar')
          )
        );
      })
    );
  }

  /* ================= Edición manual de un partido ================= */
  async function editarPartido(torneo, jornada, p) {
    const r = S.liga.resultados[p.id] || null;
    const campo = (etq, valor, attrs = {}) => {
      const i = el('input', { value: valor || '', ...attrs });
      return [el('label.campo', el('span', etq), i), i];
    };
    const [cFecha, iFecha] = campo('Fecha', p.fecha, { type: 'date' });
    const [cHora, iHora] = campo('Hora', p.hora, { type: 'time' });
    const [cSede, iSede] = campo('Sede', p.sede);
    const [cInst, iInst] = campo('Instalación', p.instalacion);
    const [cDir, iDir] = campo('Dirección', p.direccion);
    const equiposSel = (valor) =>
      el(
        'select',
        el('option', { value: '' }, 'Por determinar'),
        torneo.equipos.filter((e) => jornada.eliminatoria || e.grupo === p.comp || torneo.grupos.length === 1).map((e) => el('option', { value: e.id, selected: e.id === valor }, e.nombre))
      );
    const sLoc = equiposSel(p.local), sVis = equiposSel(p.visitante);
    const sEstado = el('select', [['', 'Pendiente (sin resultado)'], ['jugado', 'Jugado'], ['aplazado', 'Aplazado'], ['suspendido', 'Suspendido']].map(([v, t]) => el('option', { value: v, selected: (r ? r.estado : '') === v }, t)));
    const iGl = el('input', { type: 'number', min: 0, inputmode: 'numeric', value: r && r.gl != null ? r.gl : '' });
    const iGv = el('input', { type: 'number', min: 0, inputmode: 'numeric', value: r && r.gv != null ? r.gv : '' });
    const iNota = el('input', { value: (r && r.nota) || '', placeholder: 'Ej.: incomparecencia, gana X en penaltis 3-2…' });
    const marcador = el('div.rejilla', el('label.campo', el('span', 'Goles local'), iGl), el('label.campo', el('span', 'Goles visitante'), iGv));
    const verMarcador = () => (marcador.hidden = sEstado.value !== 'jugado');
    sEstado.addEventListener('change', verMarcador);
    verMarcador();
    const origen = r
      ? r.fuente === 'acta'
        ? el('div.nota.nota-ok', `Publicado desde el acta ${r.acta.numero}` + (r.goles.length ? ` · ${r.goles.reduce((s, g) => s + g.goles, 0)} goles con autor` : '') + '. Si cambias el marcador, los goleadores del acta se conservan y el partido queda marcado como editado a mano.')
        : el('div.nota.nota-info', r.fuente === 'acta-corregida' ? 'Resultado del acta corregido a mano.' : 'Resultado introducido a mano.')
      : null;

    const accion = await dialogo({
      titulo: `${jornada.nombre} · editar partido`,
      cuerpo: [
        el('div.rejilla', el('label.campo', el('span', 'Local'), sLoc), el('label.campo', el('span', 'Visitante'), sVis)),
        el('div.rejilla', cFecha, cHora, cSede),
        el('div.rejilla', cInst, cDir),
        el('h3', { style: 'margin:6px 0 0' }, 'Resultado'),
        origen,
        el('label.campo', el('span', 'Estado'), sEstado),
        marcador,
        el('label.campo', el('span', 'Nota pública (opcional)'), iNota),
      ],
      botones: [
        { texto: 'Cancelar', valor: null },
        r ? { texto: 'Quitar resultado', valor: 'quitar', peligro: true } : null,
        { texto: enLinea() ? 'Guardar y publicar' : 'Guardar', valor: 'guardar', primario: true },
      ].filter(Boolean),
    });
    if (!accion) return;
    const id = p.id;
    if (accion === 'quitar') {
      if (!(await confirmar('Quitar resultado', 'Se eliminará el resultado y los goleadores de este partido.', 'Quitar', true))) return;
      return guardar((liga) => void delete liga.resultados[id], 'Quitar resultado ' + id, 'Resultado quitado.');
    }
    if (sLoc.value && sLoc.value === sVis.value) return aviso('Local y visitante no pueden ser el mismo equipo.', 'error');
    if (sEstado.value === 'jugado' && (iGl.value === '' || iGv.value === '')) return aviso('Indica el marcador.', 'error');
    const v = {
      local: sLoc.value || null, visitante: sVis.value || null, fecha: iFecha.value, hora: iHora.value,
      sede: iSede.value.trim(), instalacion: iInst.value.trim(), direccion: iDir.value.trim(),
      estado: sEstado.value, gl: iGl.value === '' ? null : Number(iGl.value), gv: iGv.value === '' ? null : Number(iGv.value), nota: iNota.value.trim(),
    };
    guardar(
      (liga) => {
        const pp = L.buscarPartido(liga, id);
        Object.assign(pp, { local: v.local, visitante: v.visitante, fecha: v.fecha, hora: v.hora, sede: v.sede, instalacion: v.instalacion, direccion: v.direccion });
        const previo = liga.resultados[id];
        if (!v.estado) return void delete liga.resultados[id];
        const base = previo || { goles: [], pp: { local: 0, visitante: 0 }, fuente: 'manual' };
        const igual = previo && v.estado === previo.estado && v.gl === previo.gl && v.gv === previo.gv;
        liga.resultados[id] = {
          ...base,
          estado: v.estado,
          gl: v.estado === 'jugado' ? v.gl : null,
          gv: v.estado === 'jugado' ? v.gv : null,
          nota: v.nota,
          fuente: base.fuente === 'manual' ? 'manual' : igual ? base.fuente : 'acta-corregida',
        };
      },
      'Editar partido ' + id,
      'Partido guardado.'
    );
  }

  /* ================= Pantalla ================= */
  function pintar() {
    const raiz = S.raiz;
    if (!raiz || !raiz.isConnected) return;
    raiz.replaceChildren();
    if (!S.liga) {
      raiz.append(el('div.tarjeta', el('h2', 'Liga y resultados'), el('div.nota.nota-alerta', 'No se ha encontrado data/liga.json en el repositorio. Súbelo para empezar.'), el('div.fila-botones', botonAbrir())));
      return;
    }
    const torneo = S.liga.torneos.find((t) => t.id === S.torneo) || S.liga.torneos[0];
    const total = Object.keys(S.liga.resultados).length;
    const input = el('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, hidden: true });
    input.addEventListener('change', () => subirActas(Array.from(input.files)).finally(() => (input.value = '')));
    const zona = el(
      'div.zona-actas',
      { tabindex: 0, role: 'button', onclick: () => input.click(), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.click()) },
      el('b', 'Subir actas (PDF)'),
      el('span', enLinea() ? 'Solo hace falta para actas que no se publicaron solas (por ejemplo, cerradas con una versión antigua de la app). Arrastra aquí los PDF.' : 'Arrastra aquí los PDF que te envían los árbitros, o pulsa para elegirlos. Puedes subir varios a la vez.'),
      input
    );
    ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => (e.preventDefault(), zona.classList.add('encima'))));
    ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => (e.preventDefault(), zona.classList.remove('encima'))));
    zona.addEventListener('drop', (e) => subirActas(Array.from(e.dataTransfer.files).filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name))));

    const selNombres = el(
      'select',
      {
        disabled: S.guardando || null,
        onchange: (e) => {
          const v = e.target.value;
          guardar((liga) => void (liga.nombresJugadores = v), 'Formato de nombres de goleadores', 'Se aplicará a las actas que se publiquen a partir de ahora.');
        },
      },
      [['corto', 'Nombre y primer apellido'], ['inicial', 'Nombre e inicial del apellido'], ['completo', 'Nombre y apellidos']].map(([v, t]) => el('option', { value: v, selected: (S.liga.nombresJugadores || 'corto') === v }, t))
    );

    let estado;
    if (S.guardando) estado = el('div.nota.nota-info', 'Guardando y publicando…');
    else if (enLinea()) estado = el('div.nota.nota-ok', `Publicación automática activada: las actas se publican al cerrarlas y tus cambios al guardarlos. ${total} ${total === 1 ? 'partido' : 'partidos'} con resultado.`);
    else if (S.cambios) estado = el('div.nota.nota-alerta', 'Hay cambios sin publicar. Descarga liga.json y súbelo a la carpeta data del repositorio. (Para que se publique solo, activa la publicación automática en la pestaña Publicar.)');
    else estado = el('div.nota.nota-info', `Publicación manual. ${total} ${total === 1 ? 'partido' : 'partidos'} con resultado. Para que las actas se publiquen solas, activa la publicación automática en la pestaña Publicar.`);

    raiz.append(
      el(
        'div.tarjeta',
        el(
          'div.fila-botones',
          { style: 'justify-content:space-between;margin-bottom:10px' },
          el('h2', { style: 'margin:0' }, 'Liga y resultados'),
          el('div.fila-botones', enLinea() ? el('button.btn.btn-peq', { onclick: recargar, disabled: S.guardando || null }, 'Actualizar') : null, el('a.btn.btn-peq', { href: 'liga/', target: '_blank', rel: 'noopener' }, 'Ver web pública ↗'))
        ),
        estado,
        zona,
        enLinea() ? null : el('div.fila-botones', { style: 'margin-top:12px' }, el('button.btn.btn-primario', { onclick: publicarManual }, 'Descargar liga.json'), botonAbrir()),
        el('label.campo', { style: 'max-width:360px;margin-top:14px' }, el('span', 'Cómo se publican los goleadores'), selNombres)
      ),
      tarjetaPendientes(),
      el('nav.pestanas', { role: 'tablist', style: 'position:static' }, S.liga.torneos.map((t) => el('button.pestana', { role: 'tab', 'aria-selected': String(t.id === torneo.id), onclick: () => ((S.torneo = t.id), pintar()) }, t.corto))),
      ...torneo.jornadas.map((j) => tarjetaJornada(torneo, j))
    );
  }

  function tarjetaJornada(torneo, j) {
    const grupo = (c) => (torneo.grupos.length > 1 ? (torneo.grupos.find((g) => g.id === c) || { nombre: c === 'fs2f' ? 'Fase final' : '' }).nombre : '');
    const hechos = j.partidos.filter((p) => S.liga.resultados[p.id]).length;
    return el(
      'details.tarjeta.jornada-adm',
      { open: hechos < j.partidos.length || null },
      el('summary', el('b', j.nombre), el('span.ayuda', ` · ${fechaCorta(j.partidos[0] && j.partidos[0].fecha)} · ${hechos}/${j.partidos.length} con resultado`)),
      el(
        'div.partidos-adm',
        j.partidos.map((p) => {
          const r = S.liga.resultados[p.id];
          const res = !r ? el('span.chip', 'Pendiente') : r.estado === 'jugado' ? el('span.marcador-adm', `${r.gl} – ${r.gv}`) : el('span.chip.chip-borrador', r.estado);
          const origen = r ? (r.fuente === 'acta' ? 'Acta ' + r.acta.numero : r.fuente === 'acta-corregida' ? 'Acta corregida a mano' : 'Manual') : '';
          return el(
            'div.partido-adm',
            el('div.cuando', fechaCorta(p.fecha) || 's/f', p.hora ? ' · ' + p.hora : '', grupo(p.comp) ? el('small', grupo(p.comp)) : null),
            el('div.equipos', el('span', nombreEq(torneo, p.local)), res, el('span', nombreEq(torneo, p.visitante))),
            el('div.origen', origen),
            el('button.btn.btn-peq', { disabled: S.guardando || null, onclick: () => editarPartido(torneo, j, L.buscarPartido(S.liga, p.id)) }, 'Editar')
          );
        })
      ),
      j.descansan && j.descansan.length ? el('p.ayuda', { style: 'margin:8px 0 0' }, 'Descansa: ' + j.descansan.map((d) => nombreEq(torneo, d.equipo)).join(', ')) : null
    );
  }

  function botonAbrir() {
    const i = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    i.addEventListener('change', async () => {
      try {
        const j = JSON.parse(await i.files[0].text());
        if (j.formato !== 'liga-fedc') throw new Error();
        S.liga = j;
        S.base = j.actualizado;
        S.cambios = false;
        S.torneo = j.torneos[0].id;
        lsSet(CLAVE_BORRADOR, null);
        pintar();
        aviso('liga.json cargado.');
      } catch {
        aviso('Ese archivo no es un liga.json válido.', 'error');
      }
    });
    return el('button.btn', { onclick: () => i.click() }, 'Abrir liga.json del ordenador', i);
  }

  function publicarManual() {
    S.liga.actualizado = new Date().toISOString();
    descargar('liga.json', JSON.stringify(S.liga, null, 1), 'application/json');
    S.base = S.liga.actualizado;
    S.cambios = false;
    lsSet(CLAVE_BORRADOR, null);
    pintar();
    aviso('liga.json descargado. Súbelo a la carpeta data del repositorio.');
  }

  global.AdminLiga = {
    async mostrar(raiz, cfg) {
      S.raiz = raiz;
      if (cfg) S.cfg = cfg;
      if (!S.liga && !S.cargando) S.cargando = cargar();
      if (S.cargando) {
        raiz.replaceChildren(el('div.tarjeta', el('p', 'Cargando la liga…')));
        await S.cargando;
        S.cargando = null;
      }
      if (S.raiz === raiz) pintar();
    },
    /** Al cambiar la configuración de publicación, se vuelve a cargar desde la fuente adecuada. */
    reiniciar() {
      S.liga = null;
      S.cambios = false;
    },
    hayCambios: () => S.cambios,
    _S: S,
  };
})(window);
