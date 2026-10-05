/*
  Punto de entrada: monta React dentro de <div id="raiz"> (ver index.html).
  Los "proveedores" envuelven a toda la app para que cualquier componente
  pueda usar el router, la sesión y los avisos.
*/
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { ProveedorAutenticacion } from "./contexto/AutenticacionContexto";
import { ProveedorAvisos } from "./contexto/AvisosContexto";
import "./estilos/tema.css";

createRoot(document.getElementById("raiz")).render(
  // StrictMode solo actúa en desarrollo: ejecuta ciertos efectos dos veces
  // a propósito para destapar errores. En producción no hace nada.
  <StrictMode>
    <BrowserRouter>
      <ProveedorAutenticacion>
        <ProveedorAvisos>
          <App />
        </ProveedorAvisos>
      </ProveedorAutenticacion>
    </BrowserRouter>
  </StrictMode>,
);
