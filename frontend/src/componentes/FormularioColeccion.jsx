/*
  Formulario en línea para crear o editar una colección.
  Es un "componente controlado": el valor de cada campo vive en el
  estado de React (useState) y el <input> solo lo muestra. Así siempre
  sabemos qué hay escrito, sin tener que leer el DOM.
*/
import { useEffect, useId, useRef, useState } from "react";
import { leerErrores } from "../utilidades/formato";
import estilos from "./FormularioColeccion.module.css";

export default function FormularioColeccion({
  inicial = { nombre: "", descripcion: "" },
  textoGuardar = "Guardar",
  conDescripcion = true,
  onGuardar,
  onCancelar,
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [descripcion, setDescripcion] = useState(inicial.descripcion ?? "");
  const [errores, setErrores] = useState({ general: null, campos: {} });
  const [guardando, setGuardando] = useState(false);
  const campoNombre = useRef(null);
  // useId genera ids únicos para enlazar cada <label> con su <input>
  const id = useId();

  useEffect(() => {
    campoNombre.current?.focus();
    campoNombre.current?.select();
  }, []);

  async function alEnviar(evento) {
    evento.preventDefault(); // evita que el navegador recargue la página
    if (!nombre.trim()) {
      setErrores({ general: null, campos: { nombre: "Escribe un nombre." } });
      return;
    }
    setGuardando(true);
    try {
      await onGuardar({ nombre: nombre.trim(), descripcion: descripcion.trim() });
    } catch (error) {
      setErrores(leerErrores(error));
      setGuardando(false);
    }
  }

  return (
    <form
      className={estilos.formulario}
      onSubmit={alEnviar}
      onKeyDown={(evento) => evento.key === "Escape" && onCancelar()}
      noValidate
    >
      <div className="campo">
        <label htmlFor={`${id}-nombre`}>Nombre</label>
        <input
          ref={campoNombre}
          id={`${id}-nombre`}
          className="entrada"
          value={nombre}
          maxLength={120}
          onChange={(evento) => setNombre(evento.target.value)}
          aria-invalid={Boolean(errores.campos.nombre)}
          placeholder="Ej. Tesis de maestría"
        />
        {errores.campos.nombre && <span className="campo-mensaje">{errores.campos.nombre}</span>}
      </div>

      {conDescripcion && (
        <div className="campo">
          <label htmlFor={`${id}-descripcion`}>Descripción (opcional)</label>
          <textarea
            id={`${id}-descripcion`}
            className="entrada"
            rows={2}
            value={descripcion}
            onChange={(evento) => setDescripcion(evento.target.value)}
            placeholder="¿Qué tipo de documentos guardarás aquí?"
          />
        </div>
      )}

      {errores.general && <span className="campo-mensaje">{errores.general}</span>}

      <div className={estilos.acciones}>
        <button className="boton boton-primario boton-chico" type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : textoGuardar}
        </button>
        <button className="boton boton-fantasma boton-chico" type="button" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
