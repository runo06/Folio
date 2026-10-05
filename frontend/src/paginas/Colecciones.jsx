import { useEffect, useState } from "react";
import { colecciones as api } from "../api/folio";
import Dialogo from "../componentes/Dialogo";
import FormularioColeccion from "../componentes/FormularioColeccion";
import TarjetaColeccion from "../componentes/TarjetaColeccion";
import { useAvisos } from "../contexto/AvisosContexto";
import { mensajeDeError, plural } from "../utilidades/formato";
import estilos from "./Colecciones.module.css";

export default function Colecciones() {
  const avisar = useAvisos();

  // null = todavía cargando; [] = cargó y no hay colecciones
  const [lista, setLista] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [creando, setCreando] = useState(false);
  const [porBorrar, setPorBorrar] = useState(null);
  const [borrando, setBorrando] = useState(false);

  // Cargar la lista al entrar a la página
  useEffect(() => {
    api
      .listar()
      .then(setLista)
      .catch((error) => setErrorCarga(mensajeDeError(error)));
  }, []);

  async function crear(datos) {
    const nueva = await api.crear(datos); // si falla, el formulario muestra el error
    // Nunca modificamos el estado directamente: creamos un arreglo nuevo
    setLista((actual) => [nueva, ...actual]);
    setCreando(false);
    avisar(`Colección «${nueva.nombre}» creada.`);
  }

  async function renombrar(id, datos) {
    const actualizada = await api.actualizar(id, datos);
    setLista((actual) => actual.map((c) => (c.id === id ? actualizada : c)));
    avisar(`Colección renombrada a «${actualizada.nombre}».`);
  }

  async function confirmarBorrado() {
    setBorrando(true);
    try {
      await api.borrar(porBorrar.id);
      setLista((actual) => actual.filter((c) => c.id !== porBorrar.id));
      avisar(`Colección «${porBorrar.nombre}» borrada.`);
      setPorBorrar(null);
    } catch (error) {
      avisar(mensajeDeError(error), "error");
    } finally {
      setBorrando(false);
    }
  }

  if (errorCarga) return <p className="aviso-error">{errorCarga}</p>;
  if (lista === null) return <p className={estilos.cargando}>Cargando colecciones…</p>;

  const totalDocumentos = lista.reduce((suma, c) => suma + c.total_documentos, 0);

  return (
    <>
      <div className={estilos.encabezado}>
        <div>
          <h1>Tus colecciones</h1>
          <p className={`${estilos.resumen} num`}>
            {plural(lista.length, "colección", "colecciones")} · {plural(totalDocumentos, "documento")}
          </p>
        </div>
        {!creando && (
          <button className="boton boton-primario" type="button" onClick={() => setCreando(true)}>
            + Nueva colección
          </button>
        )}
      </div>

      {lista.length === 0 && !creando && (
        <div className={estilos.vacio}>
          <h2>Empieza con tu primera colección</h2>
          <p>
            Una colección agrupa PDF de un mismo tema: tu tesis, los contratos de la casa, los apuntes de un
            semestre. Después podrás hacerle preguntas a todos sus documentos a la vez.
          </p>
          <button className="boton boton-primario" type="button" onClick={() => setCreando(true)}>
            Crear colección
          </button>
        </div>
      )}

      {(lista.length > 0 || creando) && (
        <div className={estilos.rejilla}>
          {creando && (
            <article className={estilos.nueva}>
              <FormularioColeccion textoGuardar="Crear" onGuardar={crear} onCancelar={() => setCreando(false)} />
            </article>
          )}
          {lista.map((coleccion) => (
            <TarjetaColeccion
              key={coleccion.id}
              coleccion={coleccion}
              onRenombrar={renombrar}
              onBorrar={setPorBorrar}
            />
          ))}
        </div>
      )}

      <Dialogo
        abierto={Boolean(porBorrar)}
        titulo={porBorrar ? `¿Borrar «${porBorrar.nombre}»?` : ""}
        textoConfirmar="Borrar colección"
        ocupado={borrando}
        onConfirmar={confirmarBorrado}
        onCancelar={() => setPorBorrar(null)}
      >
        {porBorrar && (
          <p>
            {porBorrar.total_documentos > 0 ? (
              <>
                Se borrarán también sus <span className="num">{plural(porBorrar.total_documentos, "documento")}</span> (
                <span className="num">{porBorrar.total_paginas}</span> páginas).{" "}
              </>
            ) : null}
            Esta acción no se puede deshacer.
          </p>
        )}
      </Dialogo>
    </>
  );
}
