/*
  Una página del PDF. Mientras está lejos de la pantalla es solo un
  rectángulo gris del tamaño correcto; cuando se acerca, se dibuja.

  Tiene dos capas apiladas:
  - <canvas>: la imagen de la página, dibujada por PDF.js
  - capa de texto: <span> transparentes encima de cada palabra. No se
    ven, pero permiten seleccionar texto y, a nosotros, resaltar el
    fragmento citado.
*/
import { useEffect, useRef, useState } from "react";
import { TextLayer } from "pdfjs-dist";
import { buscarFragmento } from "../utilidades/resaltado";
import estilos from "./VisorPdf.module.css";

export default function PaginaPdf({ pdf, numero, escala, base, raiz, resaltado, alRegistrar }) {
  const caja = useRef(null);
  const lienzo = useRef(null);
  const capaTexto = useRef(null);
  const [cerca, setCerca] = useState(false);
  // Tamaño de ESTA página a escala 1. Se multiplica por la escala al dibujar,
  // así el tamaño cambia en el mismo instante que el zoom (sin esperar a redibujar)
  const [tamano, setTamano] = useState(null);
  const [capa, setCapa] = useState(null); // TextLayer ya dibujada
  const [dibujada, setDibujada] = useState(false);

  // El visor necesita saber dónde está cada página para saltar a ella
  useEffect(() => {
    alRegistrar(numero, caja.current);
    return () => alRegistrar(numero, null);
  }, [numero, alRegistrar]);

  // IntersectionObserver avisa cuando la página entra (o sale) del área
  // visible, con 800px de margen para dibujar un poco antes de llegar
  useEffect(() => {
    const observador = new IntersectionObserver(([entrada]) => setCerca(entrada.isIntersecting), {
      root: raiz,
      rootMargin: "800px 0px",
    });
    observador.observe(caja.current);
    return () => observador.disconnect();
  }, [raiz]);

  // Dibujar (o volver a dibujar si cambia el zoom)
  useEffect(() => {
    if (!cerca) return;
    let cancelado = false;
    let tareaDibujo = null;
    let tareaTexto = null;

    (async () => {
      const pagina = await pdf.getPage(numero);
      if (cancelado) return;
      const vista = pagina.getViewport({ scale: escala });
      const original = pagina.getViewport({ scale: 1 });
      setTamano({ ancho: original.width, alto: original.height });

      // En pantallas de alta densidad dibujamos con más píxeles para que se vea nítido
      const densidad = window.devicePixelRatio || 1;
      const canvas = lienzo.current;
      canvas.width = Math.floor(vista.width * densidad);
      canvas.height = Math.floor(vista.height * densidad);
      tareaDibujo = pagina.render({
        canvas,
        viewport: vista,
        transform: densidad === 1 ? undefined : [densidad, 0, 0, densidad, 0, 0],
      });
      await tareaDibujo.promise;
      if (cancelado) return;
      setDibujada(true);

      capaTexto.current.replaceChildren();
      tareaTexto = new TextLayer({
        textContentSource: pagina.streamTextContent(),
        container: capaTexto.current,
        viewport: vista,
      });
      await tareaTexto.render();
      if (!cancelado) setCapa(tareaTexto);
    })().catch((error) => {
      if (error?.name !== "RenderingCancelledException" && !cancelado) console.error(error);
    });

    return () => {
      cancelado = true;
      tareaDibujo?.cancel();
      tareaTexto?.cancel();
      setCapa(null);
    };
  }, [cerca, escala, pdf, numero]);

  // Resaltar el fragmento citado cuando la capa de texto esté lista
  useEffect(() => {
    if (!capa) return;
    capa.textDivs.forEach((span) => span.classList.remove(estilos.resaltado));
    if (!resaltado || resaltado.pagina !== numero) return;

    const indices = buscarFragmento(capa.textContentItemsStr, resaltado.texto);
    indices.forEach((indice) => capa.textDivs[indice]?.classList.add(estilos.resaltado));
    // "nearest": solo se mueve si el fragmento no se ve (p. ej. está al final de la página)
    capa.textDivs[indices[0]]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [capa, resaltado, numero]);

  const ancho = (tamano ?? base).ancho * escala;
  const alto = (tamano ?? base).alto * escala;

  return (
    <div
      ref={caja}
      className={estilos.pagina}
      data-pagina={numero}
      style={{
        width: ancho,
        height: alto,
        // Variables que la hoja de estilos de PDF.js usa para escalar la capa de texto
        "--total-scale-factor": escala,
        "--scale-round-x": "1px",
        "--scale-round-y": "1px",
      }}
    >
      {!dibujada && (
        <span className={`${estilos.numeroFantasma} num`} aria-hidden="true">
          {numero}
        </span>
      )}
      <canvas ref={lienzo} className={estilos.lienzo} style={{ width: ancho, height: alto }} />
      <div ref={capaTexto} className="textLayer" />
    </div>
  );
}
