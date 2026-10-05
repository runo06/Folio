import { useState } from "react";
import { Link } from "react-router";
import { plural } from "../utilidades/formato";
import FormularioColeccion from "./FormularioColeccion";
import Lomos from "./Lomos";
import estilos from "./TarjetaColeccion.module.css";

/*
  Una colección en la lista. Tiene dos modos:
  - normal: título (enlace a la colección), descripción, lomos y botones
  - editando: el formulario aparece dentro de la misma tarjeta
*/
export default function TarjetaColeccion({ coleccion, onRenombrar, onBorrar }) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <article className={`${estilos.tarjeta} ${estilos.editando}`}>
        <FormularioColeccion
          inicial={coleccion}
          onGuardar={async (datos) => {
            await onRenombrar(coleccion.id, datos);
            setEditando(false);
          }}
          onCancelar={() => setEditando(false)}
        />
      </article>
    );
  }

  return (
    <article className={estilos.tarjeta}>
      <div>
        {/* El enlace se "estira" con CSS para cubrir toda la tarjeta */}
        <h2 className={estilos.titulo}>
          <Link to={`/colecciones/${coleccion.id}`} className={estilos.enlace}>
            {coleccion.nombre}
          </Link>
        </h2>
        {coleccion.descripcion && <p className={estilos.descripcion}>{coleccion.descripcion}</p>}
      </div>

      <div className={estilos.pie}>
        <Lomos paginas={coleccion.paginas_por_documento} />
        <span className={`${estilos.datos} num`}>
          {plural(coleccion.total_documentos, "doc")} · {coleccion.total_paginas} págs
        </span>
      </div>

      <div className={estilos.acciones}>
        <button className="boton boton-fantasma boton-chico" type="button" onClick={() => setEditando(true)}>
          Renombrar
        </button>
        <button className="boton boton-fantasma boton-chico" type="button" onClick={() => onBorrar(coleccion)}>
          Borrar
        </button>
      </div>
    </article>
  );
}
