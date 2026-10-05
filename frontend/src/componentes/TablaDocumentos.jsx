import { formatoFechaCorta, formatoTamano } from "../utilidades/formato";
import EstadoDocumento from "./EstadoDocumento";
import estilos from "./TablaDocumentos.module.css";

export default function TablaDocumentos({ documentos, abriendo, onAbrir, onBorrar }) {
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
                  <span title={documento.nombre_original}>{documento.nombre_original}</span>
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
