import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import Prism from "prismjs";
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-basic';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-haskell';
import 'prismjs/components/prism-fortran';
import 'prismjs/components/prism-solidity';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prism-themes/themes/prism-synthwave84.css';

export default function Message({ role, mode, style, toolAction, content, streaming, children }) {

  useEffect(() => {
    Prism.highlightAll();
  }, [content]);

  const renderMessage = (text) => {
    const html = marked.parse(text);
    return { __html: DOMPurify.sanitize(html) };
  };

  if (style === "system") {
    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <pre
          className="whitespace-pre-wrap break-words p-4 rounded-xl
                     bg-black/90 border border-green-800
                     text-green-400 font-mono text-sm
                     drop-shadow-[0_0_6px_rgba(0,255,0,0.7)]
                     animate-pulse-slow"
        >
          {content}
        </pre>
      </div>
    );
  } 

  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[80%] px-5 py-4 rounded-2xl shadow-lg border overflow-hidden
          ${isUser
            ? "bg-gradient-to-br from-purple-600 to-pink-600 border-purple-500/50 text-white"
            : "bg-gray-800/80 border-white/10 text-gray-100"
          }`}
      >
        <div
          className="prose prose-invert
                      prose-pre:bg-black/40 prose-pre:text-gray-100
                      prose-headings:text-white prose-p:text-white
                      prose-strong:text-white prose-code:text-white
                      prose-li:text-white prose-pre:rounded-xl
                      prose-pre:p-4 prose-pre:overflow-x-auto
                      max-w-full prose-code:text-[0.85rem]"
          dangerouslySetInnerHTML={renderMessage(content)}
        />

        {/* Blinking cursor for streaming */}
        {streaming && (
          <span className="inline-block w-2 h-5 bg-cyan-400 animate-pulse ml-1 align-bottom" />
        )}

        {children && (
          <div>{children}</div>
        )}
      </div>
    </div>
  );
}

