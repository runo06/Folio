import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAutenticacion } from "../contexto/AutenticacionContexto";
import { leerErrores } from "../utilidades/formato";
import DisenoAcceso from "./DisenoAcceso";
import estilos from "./Acceso.module.css";

export default function Registro() {
  const { registrar } = useAutenticacion();
  const navegar = useNavigate();

  // Un solo objeto de estado para todo el formulario
  const [datos, setDatos] = useState({ nombre: "", email: "", password: "" });
  const [errores, setErrores] = useState({ general: null, campos: {} });
  const [enviando, setEnviando] = useState(false);

  // Una sola función maneja todos los campos gracias al atributo "name"
  function alCambiar(evento) {
    const { name, value } = evento.target;
    setDatos((anteriores) => ({ ...anteriores, [name]: value }));
  }

  async function alEnviar(evento) {
    evento.preventDefault();
    setErrores({ general: null, campos: {} });
    setEnviando(true);
    try {
      await registrar(datos);
      navegar("/colecciones", { replace: true });
    } catch (fallo) {
      setErrores(leerErrores(fallo));
      setEnviando(false);
    }
  }

  return (
    <DisenoAcceso>
      <form className={estilos.formulario} onSubmit={alEnviar}>
        <div>
          <h1>Crear cuenta</h1>
          <p className={estilos.subtitulo}>Solo tú verás los documentos que subas.</p>
        </div>

        {errores.general && (
          <div className="aviso-error" role="alert">
            {errores.general}
          </div>
        )}

        <div className="campo">
          <label htmlFor="registro-nombre">Nombre</label>
          <input
            id="registro-nombre"
            name="nombre"
            className="entrada"
            autoComplete="name"
            value={datos.nombre}
            onChange={alCambiar}
          />
        </div>

        <div className="campo">
          <label htmlFor="registro-correo">Correo</label>
          <input
            id="registro-correo"
            name="email"
            className="entrada"
            type="email"
            autoComplete="email"
            required
            value={datos.email}
            onChange={alCambiar}
            aria-invalid={Boolean(errores.campos.email)}
          />
          {errores.campos.email && <span className="campo-mensaje">{errores.campos.email}</span>}
        </div>

        <div className="campo">
          <label htmlFor="registro-clave">Contraseña</label>
          <input
            id="registro-clave"
            name="password"
            className="entrada"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={datos.password}
            onChange={alCambiar}
            aria-invalid={Boolean(errores.campos.password)}
            aria-describedby="registro-clave-ayuda"
          />
          {errores.campos.password ? (
            <span className="campo-mensaje">{errores.campos.password}</span>
          ) : (
            <span id="registro-clave-ayuda" className={estilos.subtitulo}>
              Mínimo 8 caracteres, que no sea solo números ni una contraseña común.
            </span>
          )}
        </div>

        <button className="boton boton-primario" type="submit" disabled={enviando}>
          {enviando ? "Creando cuenta…" : "Crear cuenta"}
        </button>

        <p className={estilos.pie}>
          ¿Ya tienes cuenta? <Link to="/entrar">Entra</Link>
        </p>
      </form>
    </DisenoAcceso>
  );
}
