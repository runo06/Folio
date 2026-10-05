import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAutenticacion } from "../contexto/AutenticacionContexto";
import { leerErrores } from "../utilidades/formato";
import DisenoAcceso from "./DisenoAcceso";
import estilos from "./Acceso.module.css";

export default function Entrar() {
  const { entrar } = useAutenticacion();
  const navegar = useNavigate();
  const ubicacion = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(evento) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await entrar(email, password);
      // Regresa a la página que quería ver antes de que le pidiéramos entrar
      navegar(ubicacion.state?.desde ?? "/colecciones", { replace: true });
    } catch (fallo) {
      const { general, campos } = leerErrores(fallo);
      setError(general ?? Object.values(campos)[0]);
      setEnviando(false);
    }
  }

  return (
    <DisenoAcceso>
      <form className={estilos.formulario} onSubmit={alEnviar}>
        <div>
          <h1>Entrar</h1>
          <p className={estilos.subtitulo}>Bienvenido de vuelta a tus documentos.</p>
        </div>

        {error && (
          <div className="aviso-error" role="alert">
            {error}
          </div>
        )}

        <div className="campo">
          <label htmlFor="entrar-correo">Correo</label>
          <input
            id="entrar-correo"
            className="entrada"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </div>

        <div className="campo">
          <label htmlFor="entrar-clave">Contraseña</label>
          <input
            id="entrar-clave"
            className="entrada"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
          />
        </div>

        <button className="boton boton-primario" type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>

        <p className={estilos.pie}>
          ¿Aún no tienes cuenta? <Link to="/registro">Crea una</Link>
        </p>
      </form>
    </DisenoAcceso>
  );
}
