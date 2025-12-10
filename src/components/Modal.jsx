import React from "react";
import { createPortal } from "react-dom";

export default function Modal({ open, onClose, children, title = "Modal" }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-8">
      <div
        className="
          flex flex-col h-screen
          w-full max-w-[1000px]
          bg-[#121212] text-white
          rounded-xl shadow-2xl
          border border-[#010102]/40
          overflow-hidden
        "
      >
        {/* Header */}
        <div className="bg-[#010102]/40 p-8 flex-shrink-0 flex flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-2 w-10 rounded-full bg-[#6EC6FF]"></div>
            <h2 className="text-xl font-semibold tracking-wider">{title}</h2>
          </div>
          <button
            className="btn btn-sm bg-[#6EC6FF] text-black border-0 hover:bg-[#58B6ED]"
            onClick={onClose}
          >
            CLOSE
          </button>
        </div>

        {/* Content injected inline */}
        <div className="p-6 overflow-y-auto flex-col min-h-0 flex-1">{children}</div>

        {/* Footer */}
        <div className="bg-[#010102]/20 p-4 flex-shrink-0 flex justify-end gap-2">
          <button
            className="btn border-0 bg-[#6EC6FF] text-black hover:bg-[#58B6ED]"
            onClick={onClose}
          >
            CANCEL
          </button>
          <button className="btn border-0 bg-[#010102] text-black hover:bg-[#F09842]">
            SAVE
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

