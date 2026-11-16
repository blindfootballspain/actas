/*
 * Cálculos de la liga (clasificación, goleadores, resultados) a partir de data/liga.json.
 * Lo usan la administración y la web pública, así ambas muestran siempre lo mismo.
 */
(function (global) {
  'use strict';

  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const torneoDeComp = (liga, comp) =>
    liga.torneos.find((t) => t.grupos.some((g) => g.id === comp) || (comp === 'fs2f' && t.id === 'fs2'));

  const equipo = (torneo, id) => torneo.equipos.find((e) => e.id === id);

  /** Todos los partidos de un torneo con su jornada. */
  function partidos(torneo) {
    const out = [];
    torneo.jornadas.forEach((j) => j.partidos.forEach((p) => out.push({ ...p, jornada: j.n, nombreJornada: j.nombre, eliminatoria: !!j.eliminatoria })));
    return out;
  }

  const jugado = (r) => r && r.estado === 'jugado' && r.gl !== '' && r.gv !== '' && r.gl != null && r.gv != null;

  /** Clasificación de un grupo. Desempate: puntos, enfrentamientos directos (puntos, diferencia, goles), diferencia general, goles a favor. */
  function clasificacion(liga, torneo, grupoId) {
    const P = liga.puntos || { victoria: 3, empate: 1, derrota: 0 };
    const filas = {};
    torneo.equipos
      .filter((e) => e.grupo === grupoId || torneo.grupos.length === 1)
      .forEach((e) => (filas[e.id] = { id: e.id, nombre: e.nombre, corto: e.corto || e.nombre, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0, forma: [] }));
    const jugados = partidos(torneo)
      .filter((p) => !p.eliminatoria && (p.comp === grupoId || torneo.grupos.length === 1))
      .map((p) => ({ p, r: liga.resultados[p.id] }))
      .filter(({ p, r }) => jugado(r) && filas[p.local] && filas[p.visitante])
      .sort((a, b) => (a.p.fecha || '').localeCompare(b.p.fecha || '') || a.p.jornada - b.p.jornada);

    const sumar = (f, gf, gc) => {
      f.pj++;
      f.gf += gf;
      f.gc += gc;
      if (gf > gc) (f.g++, (f.pts += P.victoria), f.forma.push('V'));
      else if (gf === gc) (f.e++, (f.pts += P.empate), f.forma.push('E'));
      else (f.p++, (f.pts += P.derrota), f.forma.push('D'));
    };
    jugados.forEach(({ p, r }) => {
      sumar(filas[p.local], +r.gl, +r.gv);
      sumar(filas[p.visitante], +r.gv, +r.gl);
    });

    // Mini-liga entre empatados a puntos
    const directo = (ids) => {
      const m = {};
      ids.forEach((id) => (m[id] = { pts: 0, dg: 0, gf: 0 }));
      jugados.forEach(({ p, r }) => {
        if (!m[p.local] || !m[p.visitante]) return;
        const gl = +r.gl, gv = +r.gv;
        m[p.local].gf += gl; m[p.visitante].gf += gv;
        m[p.local].dg += gl - gv; m[p.visitante].dg += gv - gl;
        if (gl > gv) m[p.local].pts += P.victoria;
        else if (gl < gv) m[p.visitante].pts += P.victoria;
        else (m[p.local].pts += P.empate, (m[p.visitante].pts += P.empate));
      });
      return m;
    };
    const lista = Object.values(filas);
    lista.forEach((f) => (f.dg = f.gf - f.gc));
    const grupos = {};
    lista.forEach((f) => (grupos[f.pts] = grupos[f.pts] || []).push(f.id));
    const h2h = {};
    Object.values(grupos).forEach((ids) => {
      if (ids.length > 1) Object.assign(h2h, directo(ids));
    });
    lista.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const x = h2h[a.id], y = h2h[b.id];
      if (x && y) {
        if (y.pts !== x.pts) return y.pts - x.pts;
        if (y.dg !== x.dg) return y.dg - x.dg;
        if (y.gf !== x.gf) return y.gf - x.gf;
      }
      return b.dg - a.dg || b.gf - a.gf || a.nombre.localeCompare(b.nombre, 'es');
    });
    lista.forEach((f, i) => {
      f.pos = i + 1;
      f.forma = f.forma.slice(-5);
    });
    return lista;
  }

  /** Ranking de goleadores de un torneo (todas sus fases). */
  function goleadores(liga, torneo) {
    const m = {};
    partidos(torneo).forEach((p) => {
      const r = liga.resultados[p.id];
      if (!jugado(r)) return;
      (r.goles || []).forEach((g) => {
        const k = g.equipo + '|' + norm(g.nombre);
        if (!m[k]) m[k] = { nombre: g.nombre, equipo: g.equipo, goles: 0, partidos: 0 };
        m[k].goles += Number(g.goles) || 0;
        m[k].partidos++;
      });
    });
    const lista = Object.values(m)
      .filter((x) => x.goles > 0)
      .sort((a, b) => b.goles - a.goles || a.partidos - b.partidos || a.nombre.localeCompare(b.nombre, 'es'));
    let pos = 0, ant = null;
    lista.forEach((x, i) => {
      if (x.goles !== ant) (pos = i + 1), (ant = x.goles);
      x.pos = pos;
    });
    return lista;
  }

  /** Formatea el nombre de un jugador según la preferencia de publicación. */
  function nombreJugador(nombre, apellidos, formato) {
    nombre = String(nombre || '').trim();
    const ap = String(apellidos || '').trim().split(/\s+/).filter(Boolean);
    if (formato === 'completo') return [nombre, ...ap].join(' ');
    if (formato === 'inicial') return ap.length ? `${nombre} ${ap[0][0].toUpperCase()}.` : nombre;
    // 'corto': nombre + primer apellido (respeta partículas como "de la")
    const part = ['de', 'del', 'la', 'las', 'los', 'y', 'da', 'van', 'von'];
    const primero = [];
    for (const w of ap) {
      primero.push(w);
      if (!part.includes(w.toLowerCase())) break;
    }
    return [nombre, ...primero].join(' ');
  }

  /* ================= Actas → resultados ================= */

  const fechaCorta = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

  function buscarPartido(liga, id) {
    for (const t of liga.torneos) for (const j of t.jornadas) for (const p of j.partidos) if (p.id === id) return p;
    return null;
  }

  /** Busca el partido del calendario que corresponde a un acta. */
  function asignarActa(liga, acta) {
    const torneo = torneoDeComp(liga, acta.competicion);
    if (!torneo) return { error: 'La competición del acta no está en el calendario.' };
    const idEquipo = (t) => {
      if (t.equipoId && torneo.equipos.some((e) => e.id === t.equipoId)) return t.equipoId;
      const n = norm(t.nombre);
      const e = torneo.equipos.find((x) => norm(x.nombre) === n || norm(x.corto) === n);
      return e ? e.id : null;
    };
    const loc = idEquipo(acta.local), vis = idEquipo(acta.visitante);
    if (!loc || !vis)
      return { torneo, error: 'Algún equipo del acta no está en el calendario (' + [!loc && acta.local.nombre, !vis && acta.visitante.nombre].filter(Boolean).join(', ') + ').' };
    const jActa = parseInt(String(acta.partido.jornada || '').replace(/\D/g, ''), 10);
    const dias = (p) => (p.fecha && acta.partido.fecha ? Math.abs(new Date(p.fecha) - new Date(acta.partido.fecha)) / 864e5 : 999);
    const cand = partidos(torneo)
      .filter((p) => p.comp === acta.competicion)
      .map((p) => {
        let tipo = null;
        if (p.local === loc && p.visitante === vis) tipo = 'exacto';
        else if (p.local === vis && p.visitante === loc) tipo = 'invertido';
        else if (p.eliminatoria && !p.local && !p.visitante) tipo = 'por-definir';
        return { p, tipo };
      })
      .filter((c) => c.tipo);
    // En la fase final, los cruces por definir se eligen por fecha
    const peso = (c) => (c.tipo === 'exacto' ? 0 : c.tipo === 'invertido' ? 1000 : 2000) + (jActa && c.p.jornada === jActa ? 0 : 100) + dias(c.p);
    cand.sort((a, b) => peso(a) - peso(b));
    if (!cand.length) return { torneo, loc, vis, error: 'No hay ningún partido entre estos equipos en el calendario.' };
    const elegido = cand[0];
    const avisos = [];
    if (elegido.tipo === 'invertido') avisos.push('En el acta los equipos figuran como local y visitante al revés que en el calendario; se ha ajustado.');
    if (elegido.p.fecha && acta.partido.fecha && dias(elegido.p) > 3)
      avisos.push(`La fecha del acta (${fechaCorta(acta.partido.fecha)}) no coincide con la del calendario (${fechaCorta(elegido.p.fecha)}).`);
    return { torneo, loc, vis, partido: elegido.p, tipo: elegido.tipo, avisos };
  }

  /** Convierte un acta en el resultado público: marcador y goleadores, nada más. */
  function resultadoDesdeActa(liga, acta, invertido) {
    const formato = liga.nombresJugadores || 'corto';
    const torneo = torneoDeComp(liga, acta.competicion);
    const idDe = (t) =>
      t.equipoId && torneo.equipos.some((e) => e.id === t.equipoId) ? t.equipoId : (torneo.equipos.find((e) => norm(e.nombre) === norm(t.nombre)) || {}).id || null;
    const goles = [];
    ['local', 'visitante'].forEach((lado) => {
      const t = acta[lado];
      const eq = idDe(t);
      (t.jugadores || [])
        .filter((j) => j.juega && j.participa !== false && Number(j.goles) > 0)
        .forEach((j) => goles.push({ equipo: eq, nombre: nombreJugador(j.nombre, j.apellidos, formato), goles: Number(j.goles) }));
    });
    let gl = Number(acta.resultado.local), gv = Number(acta.resultado.visitante);
    let ppl = Number(acta.local.ppFavor) || 0, ppv = Number(acta.visitante.ppFavor) || 0;
    if (invertido) [gl, gv, ppl, ppv] = [gv, gl, ppv, ppl];
    return {
      estado: 'jugado',
      gl,
      gv,
      goles,
      pp: { local: ppl, visitante: ppv },
      fuente: 'acta',
      acta: { numero: acta.numero, cierre: acta.cierre && acta.cierre.fecha, arbitro: acta.cierre && acta.cierre.arbitro },
      nota: '',
    };
  }

  /** Coloca un resultado en un partido concreto (y completa el calendario con lo que traiga el acta). */
  function colocarResultado(liga, partidoId, resultado, extra = {}) {
    const p = buscarPartido(liga, partidoId);
    if (!p) return false;
    if (extra.local && extra.visitante && (!p.local || !p.visitante)) {
      p.local = extra.local;
      p.visitante = extra.visitante;
    }
    if (!p.hora && extra.hora) p.hora = extra.hora;
    if (!p.instalacion && extra.instalacion) p.instalacion = extra.instalacion;
    liga.resultados[partidoId] = resultado;
    liga.pendientes = (liga.pendientes || []).filter((x) => x.numero !== (resultado.acta && resultado.acta.numero));
    return true;
  }

  /**
   * Aplica un acta cerrada a la liga. Si no puede publicarse sin revisión
   * (partido no encontrado, resultado editado a mano o ya cubierto por otra acta),
   * la deja en «pendientes» para que la organización decida. Nunca guarda datos privados.
   */
  function aplicarActa(liga, acta, ahora = new Date().toISOString()) {
    liga.pendientes = liga.pendientes || [];
    const as = asignarActa(liga, acta);
    const pendiente = (motivo) => {
      liga.pendientes = liga.pendientes.filter((x) => x.numero !== acta.numero);
      liga.pendientes.push({
        numero: acta.numero,
        recibida: ahora,
        competicion: acta.competicion,
        jornada: acta.partido.jornada || '',
        fecha: acta.partido.fecha || '',
        hora: acta.partido.hora || '',
        instalacion: acta.partido.instalacion || '',
        local: { equipoId: as.loc || acta.local.equipoId || null, nombre: acta.local.nombre },
        visitante: { equipoId: as.vis || acta.visitante.equipoId || null, nombre: acta.visitante.nombre },
        partidoSugerido: as.partido ? as.partido.id : null,
        invertido: as.tipo === 'invertido',
        resultado: resultadoDesdeActa(liga, acta, false), // orientación del acta (local/visitante tal como los escribió el árbitro)
        motivo,
      });
      return { estado: 'pendiente', motivo };
    };
    if (as.error) return pendiente(as.error);
    const invertido = as.tipo === 'invertido';
    const res = resultadoDesdeActa(liga, acta, invertido);
    const previo = liga.resultados[as.partido.id];
    if (previo && previo.fuente !== 'acta') return pendiente('El partido ya tenía un resultado editado a mano por la organización.');
    if (previo && previo.acta && previo.acta.numero !== acta.numero) return pendiente('El partido ya tenía resultado de otra acta (' + previo.acta.numero + ').');
    colocarResultado(liga, as.partido.id, res, {
      local: as.tipo === 'por-definir' ? as.loc : null,
      visitante: as.tipo === 'por-definir' ? as.vis : null,
      hora: acta.partido.hora,
      instalacion: acta.partido.instalacion,
    });
    return { estado: 'publicada', partidoId: as.partido.id, avisos: as.avisos };
  }

  global.LigaCore = {
    norm, torneoDeComp, equipo, partidos, jugado, clasificacion, goleadores, nombreJugador,
    buscarPartido, asignarActa, resultadoDesdeActa, colocarResultado, aplicarActa,
  };
})(typeof window !== 'undefined' ? window : globalThis);
