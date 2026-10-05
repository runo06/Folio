import { formatoFechaCorta, formatoRangos, formatoTamano } from "../utilidades/formato";
import EstadoDocumento from "./EstadoDocumento";
import estilos from "./TablaDocumentos.module.css";

// Una línea bajo el nombre: por qué falló, o qué páginas no tenían texto
function Detalle({ documento }) {
  if (documento.estado === "error" && documento.mensaje_error) {
    return <span className={`${estilos.detalle} ${estilos.detalleError}`}>{documento.mensaje_error}</span>;
  }
  const sinTexto = documento.paginas_sin_texto ?? [];
  if (documento.estado === "listo" && sinTexto.length) {
    const texto =
      sinTexto.length > 12
        ? `${sinTexto.length} páginas sin texto legible`
        : `Sin texto legible en ${sinTexto.length === 1 ? "la pág." : "las págs."} ${formatoRangos(sinTexto)}`;
    return <span className={estilos.detalle}>{texto}</span>;
  }
  return null;
}

export default function TablaDocumentos({ documentos, abriendo, reintentando, onAbrir, onReintentar, onBorrar }) {
  return (
    <div className={estilos.marco}>
      <table className={estilos.tabla}>
        <thead>
          <tr>
            <th scope="col">Documento</th>
            <th scope="col" className={estilos.derecha}>Páginas</th>
            <th scope="col" className={estilos.derecha}>Tamaño</th>
            <th scope="col">Subido</th>
            <th scope="col">Estado</th>
            <th scope="col" className={estilos.derecha}>
              <span className="solo-lector">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {/* En React, cada elemento de una lista necesita una "key" única
              para que React sepa cuál cambió, cuál se agregó o se borró. */}
          {documentos.map((documento) => (
            <tr key={documento.id}>
              <td className={estilos.celdaNombre}>
                <div className={estilos.nombre}>
                  <i className={estilos.icono} aria-hidden="true" />
                  <div className={estilos.textos}>
                    <span className={estilos.titulo} title={documento.nombre_original}>
                      {documento.nombre_original}
                    </span>
                    <Detalle documento={documento} />
                  </div>
                </div>
              </td>
              <td className={`${estilos.derecha} ${estilos.paginas} num`}>
                {documento.num_paginas}
                <span className={estilos.unidad}> págs</span>
              </td>
              <td className={`${estilos.derecha} ${estilos.tamano} num`}>{formatoTamano(documento.tamano_bytes)}</td>
              <td className={`${estilos.fecha} num`}>{formatoFechaCorta(documento.subido)}</td>
              <td className={estilos.estado}>
                <EstadoDocumento estado={documento.estado} />
              </td>
              <td className={estilos.acciones}>
                {documento.estado === "error" && (
                  <button
                    className="boton boton-fantasma boton-chico"
                    type="button"
                    onClick={() => onReintentar(documento)}
                    disabled={reintentando === documento.id}
                    aria-label={`Reintentar el procesamiento de ${documento.nombre_original}`}
                  >
                    {reintentando === documento.id ? "Reintentando…" : "Reintentar"}
                  </button>
                )}
                <button
                  className="boton boton-fantasma boton-chico"
                  type="button"
                  onClick={() => onAbrir(documento)}
                  disabled={abriendo === documento.id}
                  aria-label={`Abrir ${documento.nombre_original}`}
                >
                  {abriendo === documento.id ? "Abriendo…" : "Abrir"}
                </button>
                <button
                  className="boton boton-fantasma boton-chico"
                  type="button"
                  onClick={() => onBorrar(documento)}
                  aria-label={`Borrar ${documento.nombre_original}`}
                >
                  Borrar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
