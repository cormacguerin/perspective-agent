import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Chat from "./components/Chat";     // your current Upload page 
import Upload from "./components/Upload";         // optional second page
import { connectWallet } from "./utils/wallet";

const App = () => {
  const [address, setAddress] = useState(null);

  async function handleConnect() {
    try {
      const { address } = await connectWallet();
      setAddress(address);
    } catch (err) {
      console.error(err);
    }
  }
  return (
    <>
      {/* Epic full-screen background with animated glows */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#010102]" />
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10" />
        
        <div className="absolute top-0 left-20 w-96 h-96 bg-purple-600/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-40 right-10 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute bottom-10 left-1/3 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      {/* Main Layout */}
    {/*
      <div className="relative min-h-screen flex flex-col">
    */}
      <div className="w-screen max-w-6xl mx-auto min-h-screen flex flex-col">

        {/* Glass navbar
        <header className="bg-black/30 backdrop-blur-xl border-b border-white/10">
          <Navbar />
        </header>

        {/* FULLSCREEN GRID LAYOUT */}
        <main className="flex-1 flex flex-row w-full">
          <section className="w-full lg:w-3/5 lg:w-1/1 flex flex-col">
            <Routes>
              <Route path="/" element={<Chat address={address} />} />
              <Route path="/upload" element={<Upload />} />
            </Routes>
          </section>

          {/* RIGHT: Video/Render Area – hidden on mobile, visible on lg+ */}
          <section className="hidden lg:block w-full lg:w-2/5 bg-black/40 backdrop-blur-md border-l border-white/10 p-8 overflow-hidden">

            <div className="w-full h-full flex items-center justify-center rounded-2xl bg-gray-900/50 border border-dashed border-gray-700 text-gray-500">
              <div className="text-center">
                <svg className="w-24 h-24 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16" />
                </svg>
                <p className="text-xl">Video Render Area</p>
                <p className="text-sm mt-2">Will appear here when media is uploaded</p>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="bg-black/50 backdrop-blur-md border-t border-white/10 py-5 text-center text-gray-500 text-sm">
          © 2025 PerspectiveAI
        </footer>
      </div>
    </>
  );
};

export default App;
