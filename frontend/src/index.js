import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "leaflet/dist/leaflet.css"; // Importa o CSS do Leaflet

// Seleciona o container root
const container = document.getElementById("root");

// Cria a raiz do React (React 18+)
const root = createRoot(container);

// Renderiza o componente principal
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
