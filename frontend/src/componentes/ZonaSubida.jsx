/*
  Zona de "arrastrar y soltar", hecha con los eventos nativos del navegador:
  - dragenter / dragover: un archivo está pasando por encima.
    Hay que llamar preventDefault() en dragover; si no, el navegador no
    permite soltar.
  - dragleave: el archivo salió de la zona.
  - drop: el usuario soltó; los archivos están en evento.dataTransfer.files.
  También hay un <input type="file"> oculto para quien prefiere hacer clic.
*/
import { useEffect, useRef, useState } from "react";
import estilos from "./ZonaSubida.module.css";

export default function ZonaSubida({ limiteMb, onArchivos }) {
  const [encima, setEncima] = useState(false);
  const selector = useRef(null);
  // Contamos entradas y salidas porque dragleave también se dispara al
  // pasar sobre un elemento hijo (el texto, el ícono...).
  const profundidad = useRef(0);

  // Si sueltan un PDF FUERA de la zona, el navegador lo abriría y la app
  // se perdería. Lo evitamos en toda la ventana mientras este componente
  // existe; la función que devolvemos quita los escuchas al desmontarse.
  useEffect(() => {
    const evitar = (evento) => evento.preventDefault();
    window.addEventListener("dragover", evitar);
    window.addEventListener("drop", evitar);
    return () => {
      window.removeEventListener("dragover", evitar);
      window.removeEventListener("drop", evitar);
    };
  }, []);

  function entregar(listaArchivos) {
    const archivos = Array.from(listaArchivos ?? []);
    if (archivos.length) onArchivos(archivos);
  }

  return (
    <div
      className={`${estilos.zona} ${encima ? estilos.encima : ""}`}
      onDragEnter={(evento) => {
        evento.preventDefault();
        profundidad.current += 1;
        setEncima(true);
      }}
      onDragOver={(evento) => evento.preventDefault()}
      onDragLeave={() => {
        profundidad.current -= 1;
        if (profundidad.current <= 0) setEncima(false);
      }}
      onDrop={(evento) => {
        evento.preventDefault();
        profundidad.current = 0;
        setEncima(false);
        entregar(evento.dataTransfer.files);
      }}
    >
      <span className={estilos.icono} aria-hidden="true">
        ↓
      </span>
      <strong className={estilos.titulo}>
        {encima ? "Suelta los archivos para subirlos" : "Arrastra tus PDF aquí"}
      </strong>
      <span className={estilos.ayuda}>
        o{" "}
        <button type="button" className={estilos.elegir} onClick={() => selector.current.click()}>
          elige archivos
        </button>
        . Solo PDF, hasta {limiteMb} MB cada uno. Los PDF con contraseña no se aceptan.
      </span>
      <input
        ref={selector}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(evento) => {
          entregar(evento.target.files);
          evento.target.value = ""; // permite volver a elegir el mismo archivo
        }}
      />
    </div>
  );
}
