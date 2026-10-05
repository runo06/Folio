/*
  Mapa de rutas: qué componente se dibuja para cada URL.
  Las rutas dentro de <DisenoApp> son privadas: DisenoApp revisa la sesión
  y, si todo está bien, dibuja la página hija en su <Outlet />.
*/
import { Navigate, Route, Routes } from "react-router";
import DisenoApp from "./componentes/DisenoApp";
import Chat from "./paginas/Chat";
import Coleccion from "./paginas/Coleccion";
import Colecciones from "./paginas/Colecciones";
import Entrar from "./paginas/Entrar";
import NoEncontrada from "./paginas/NoEncontrada";
import Registro from "./paginas/Registro";

export default function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/registro" element={<Registro />} />

      <Route element={<DisenoApp />}>
        <Route path="/colecciones" element={<Colecciones />} />
        <Route path="/colecciones/:id" element={<Coleccion />} />
        <Route path="/colecciones/:id/chat" element={<Chat />} />
      </Route>

      <Route path="/" element={<Navigate to="/colecciones" replace />} />
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}
