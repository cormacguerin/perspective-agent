import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router } from "react-router-dom";
import App from "./App.jsx";
import "./styles/globals.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <div className="min-h-screen bg-gray-900 text-white">
    <Router>
      <App />
    </Router>
  </div>
);
