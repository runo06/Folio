import { Link } from "react-router";

export default function NoEncontrada() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px 16px" }}>
      <div style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
        <span className="etiqueta num">Error 404</span>
        <h1 style={{ fontSize: 36 }}>Esta página no existe</h1>
        <Link to="/colecciones">Ir a tus colecciones</Link>
      </div>
    </main>
  );
}
