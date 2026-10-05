/*
  Visor de PDF con PDF.js.

  PDF.js separa el trabajo en dos:
  - el "worker" (un Web Worker, otro hilo del navegador) lee y decodifica
    el archivo, que es lo pesado; así la interfaz nunca se congela
  - el hilo principal solo dibuja las páginas que hace falta mostrar
*/
import { useCallback, useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
// "?url" le pide a Vite la dirección del archivo en vez de importarlo como código
import urlTrabajador from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { obtenerPdf } from "../utilidades/abrirPdf";
import { mensajeDeError } from "../utilidades/formato";
import PaginaPdf from "./PaginaPdf";
import estilos from "./VisorPdf.module.css";
import "../estilos/capaTexto.css";

GlobalWorkerOptions.workerSrc = urlTrabajador;

const ZOOM_MINIMO = 0.5;
const ZOOM_MAXIMO = 3;
const MARGEN = 32; // espacio a los lados de la página al "ajustar al ancho"

// `activo` es false cuando el visor está oculto (pestaña "Chat" en celular)
export default function VisorPdf({ documentos, destino, activo = true, onNavegar, onPaginaVisible }) {
  const idDocumento = destino?.documento ?? null;
  const documento = documentos.find((d) => d.id === idDocumento);

  const [pdf, setPdf] = useState(null);
  const [base, setBase] = useState(null); // tamaño de la página 1 a escala 1
  const [estado, setEstado] = useState("vacio"); // vacio | cargando | listo | error
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const [zoom, setZoom] = useState("ajustar"); // "ajustar" o un número
  const [anchoDisponible, setAnchoDisponible] = useState(0);
  const [paginaActual, setPaginaActual] = useState(1);
  const [paginaEscrita, setPaginaEscrita] = useState("1");

  const desplazable = useRef(null); // el contenedor con scroll
  const [raiz, setRaiz] = useState(null); // mismo elemento, como estado para los observadores
  const paginas = useRef(new Map()); // número -> elemento
  // La página actual también como ref: los efectos que corren en el mismo
  // instante (salto + cambio de zoom) necesitan el valor nuevo de inmediato,
  // sin esperar a que React vuelva a dibujar
  const paginaActualRef = useRef(paginaActual);
  paginaActualRef.current = paginaActual;

  const registrarPagina = useCallback((numero, elemento) => {
    if (elemento) paginas.current.set(numero, elemento);
    else paginas.current.delete(numero);
  }, []);

  // ---------- Cargar el documento ----------
  useEffect(() => {
    if (!idDocumento) {
      setEstado("vacio");
      return;
    }
    let cancelado = false;
    let tarea = null;
    let cargado = null;
    setEstado("cargando");
    setPdf(null);

    obtenerPdf(idDocumento)
      .then((blob) => blob.arrayBuffer())
      .then((datos) => {
        if (cancelado) return null;
        tarea = getDocument({ data: new Uint8Array(datos) });
        return tarea.promise;
      })
      .then(async (documentoPdf) => {
        if (!documentoPdf || cancelado) return;
        cargado = documentoPdf;
        const primera = await documentoPdf.getPage(1);
        const vista = primera.getViewport({ scale: 1 });
        if (cancelado) return;
        setBase({ ancho: vista.width, alto: vista.height });
        setPdf(documentoPdf);
        setEstado("listo");
      })
      .catch((fallo) => {
        if (cancelado) return;
        setError(fallo?.response ? mensajeDeError(fallo) : "No se pudo leer el PDF.");
        setEstado("error");
      });

    // Al cambiar de documento liberamos la memoria del anterior
    return () => {
      cancelado = true;
      tarea?.destroy();
      cargado?.destroy();
    };
  }, [idDocumento, intento]);

  // ---------- Ancho disponible (para "ajustar al ancho") ----------
  useEffect(() => {
    const elemento = desplazable.current;
    if (!elemento) return;
    // ResizeObserver avisa cada vez que el contenedor cambia de tamaño
    // (al arrastrar el divisor, girar el celular, etc.)
    const observador = new ResizeObserver(([entrada]) => setAnchoDisponible(entrada.contentRect.width));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [estado]);

  const escala =
    zoom === "ajustar" && base && anchoDisponible
      ? Math.max(ZOOM_MINIMO, Math.min(ZOOM_MAXIMO, (anchoDisponible - MARGEN) / base.ancho))
      : typeof zoom === "number"
        ? zoom
        : 1;

  // ---------- Saltar a la página pedida (cita, flechas, número) ----------
  useEffect(() => {
    if (estado !== "listo" || !destino?.pagina || !activo) return;
    const elemento = paginas.current.get(destino.pagina);
    if (elemento && desplazable.current) {
      desplazable.current.scrollTo({ top: elemento.offsetTop - 12 });
      paginaActualRef.current = destino.pagina;
      setPaginaActual(destino.pagina);
      setPaginaEscrita(String(destino.pagina));
    }
    // destino.clave cambia en cada clic, aunque sea a la misma página
    // Si estaba oculto, saltamos al hacerse visible (oculto no se puede medir)
  }, [estado, destino?.pagina, destino?.clave, activo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Al cambiar el zoom, seguir en la misma página ----------
  // (también cubre la primera medición del ancho, que cambia la escala
  // justo después del salto inicial)
  useEffect(() => {
    if (estado !== "listo") return;
    const elemento = paginas.current.get(paginaActualRef.current);
    if (elemento && desplazable.current) desplazable.current.scrollTo({ top: elemento.offsetTop - 12 });
  }, [escala, estado]);

  // ---------- Qué página se está viendo ----------
  function alDesplazar() {
    const contenedor = desplazable.current;
    const referencia = contenedor.scrollTop + contenedor.clientHeight / 3;
    let visible = 1;
    for (const [numero, elemento] of paginas.current) {
      if (elemento.offsetTop <= referencia && numero > visible) visible = numero;
    }
    if (visible !== paginaActual) {
      setPaginaActual(visible);
      setPaginaEscrita(String(visible));
      onPaginaVisible?.(visible);
    }
  }

  function irA(pagina) {
    if (!pdf) return;
    const destinoPagina = Math.max(1, Math.min(pdf.numPages, pagina));
    onNavegar({ documento: idDocumento, pagina: destinoPagina });
  }

  function cambiarZoom(factor) {
    setZoom(Math.max(ZOOM_MINIMO, Math.min(ZOOM_MAXIMO, Math.round(escala * factor * 10) / 10)));
  }

  // ---------- Dibujo ----------
  if (!idDocumento || !documento) {
    return (
      <div className={estilos.vacio}>
        <div className={estilos.hojaVacia} aria-hidden="true" />
        <h2>Toca una cita para ver de dónde salió la respuesta</h2>
        {documentos.length > 0 ? (
          <>
            <p>O abre un documento de esta colección:</p>
            <ul className={estilos.listaDocumentos}>
              {documentos.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => onNavegar({ documento: d.id, pagina: 1 })}>
                    {d.nombre_original} <span className="num">· {d.num_paginas} págs</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Esta colección todavía no tiene documentos listos.</p>
        )}
      </div>
    );
  }

  return (
    <div className={estilos.visor}>
      <div className={estilos.barra}>
        <label className="solo-lector" htmlFor="visor-documento">
          Documento
        </label>
        <select
          id="visor-documento"
          className={estilos.selector}
          value={idDocumento}
          onChange={(evento) => onNavegar({ documento: Number(evento.target.value), pagina: 1 })}
        >
          {documentos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre_original}
            </option>
          ))}
        </select>

        <div className={estilos.grupo}>
          <button type="button" className={estilos.icono} onClick={() => irA(paginaActual - 1)} aria-label="Página anterior" disabled={!pdf || paginaActual <= 1}>
            ‹
          </button>
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              irA(Number(paginaEscrita) || 1);
            }}
          >
            <label className="solo-lector" htmlFor="visor-pagina">
              Página
            </label>
            <input
              id="visor-pagina"
              className={`${estilos.numeroPagina} num`}
              inputMode="numeric"
              value={paginaEscrita}
              onChange={(evento) => setPaginaEscrita(evento.target.value.replace(/\D/g, ""))}
              onBlur={() => setPaginaEscrita(String(paginaActual))}
            />
          </form>
          <span className={`${estilos.total} num`}>/ {pdf?.numPages ?? documento.num_paginas}</span>
          <button type="button" className={estilos.icono} onClick={() => irA(paginaActual + 1)} aria-label="Página siguiente" disabled={!pdf || paginaActual >= pdf.numPages}>
            ›
          </button>
        </div>

        <div className={estilos.grupo}>
          <button type="button" className={estilos.icono} onClick={() => cambiarZoom(1 / 1.2)} aria-label="Alejar" disabled={escala <= ZOOM_MINIMO}>
            −
          </button>
          <button
            type="button"
            className={`${estilos.zoom} num`}
            onClick={() => setZoom("ajustar")}
            title="Ajustar al ancho"
            aria-pressed={zoom === "ajustar"}
          >
            {Math.round(escala * 100)} %
          </button>
          <button type="button" className={estilos.icono} onClick={() => cambiarZoom(1.2)} aria-label="Acercar" disabled={escala >= ZOOM_MAXIMO}>
            +
          </button>
        </div>
      </div>

      <div
        className={estilos.desplazable}
        ref={(elemento) => {
          desplazable.current = elemento;
          if (elemento !== raiz) setRaiz(elemento);
        }}
        onScroll={alDesplazar}
      >
        {estado === "cargando" && (
          <div className={estilos.cargando} role="status">
            {[1, 2].map((n) => (
              <div key={n} className={estilos.paginaFantasma}>
                <span className="num">{n}</span>
              </div>
            ))}
            <span className="solo-lector">Cargando el PDF…</span>
          </div>
        )}

        {estado === "error" && (
          <div className={estilos.error}>
            <p className="aviso-error">{error}</p>
            <button type="button" className="boton boton-secundario boton-chico" onClick={() => setIntento((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        )}

        {estado === "listo" && pdf && base && raiz && (
          <div className={estilos.paginas}>
            {Array.from({ length: pdf.numPages }, (_, i) => (
              <PaginaPdf
                key={`${idDocumento}-${i + 1}`}
                pdf={pdf}
                numero={i + 1}
                escala={escala}
                base={base}
                raiz={raiz}
                resaltado={destino?.texto && destino.pagina === i + 1 ? destino : null}
                alRegistrar={registrarPagina}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
