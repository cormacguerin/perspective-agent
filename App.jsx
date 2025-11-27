import React from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import Upload from "./pages/Upload.jsx";

const App = () => {
  return (
    <>
      {/* Full-screen background with cool blurred orbs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#010102]" />

        {/* background glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-cyan-500/15 rounded-full blur-3xl animate-pulse delay-700" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse delay-300" />
      </div>

      {/* Main app content */}
      <div className="relative min-h-screen flex flex-col bg-transparent text-white">
        <header className="shadow-xl bg-black/20 backdrop-blur-md border-b border-white/5">
          <Navbar />
        </header>

        <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/upload" element={<Upload />} />
          </Routes>
        </main>

        <footer className="bg-black/30 backdrop-blur-md border-t border-white/10 py-6 text-center text-sm text-gray-400">
          <p>© 2025 YourApp. Built with love and too much coffee.</p>
        </footer>
      </div>
    </>
  );
};

export default App;
