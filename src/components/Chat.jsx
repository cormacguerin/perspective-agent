//import React, { useState } from "react";
//import axios from "axios";
import React, { useState, useEffect, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { BrowserProvider } from "ethers";

export default function Chat({ address }) {

  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey there! I'm your AI companion. Ask me anything." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const [userAgentWallet, setUserAgentWallet] = useState("0x");
  const [nonce, setNonce] = useState("");

  useEffect(() => {
  fetch(`/getOwner?address=${encodeURIComponent(address)}`)
    .then(r => r.json())
    .then(d => {
      setUserAgentWallet(d.owner || "");
      setNonce(d.nonce); 
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);
    setStreamingText("");

    // Add empty assistant message that will be filled as it streams
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    // Start SSE
    eventSourceRef.current = new EventSource(`/agent?message=${encodeURIComponent(userMessage)}`);

    eventSourceRef.current.addEventListener("token", (e) => {
      try {
        const data = JSON.parse(e.data);
        setStreamingText(prev => prev + data.tokens.join(""));
      } catch (err) {
        console.log("Token parse error:", err);
      }
    });

    eventSourceRef.current.addEventListener("done", (e) => {
      const result = JSON.parse(e.data);

      // Finalize the streaming message
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = streamingText + (result.text || "");
        return newMsgs;
      });

      setStreamingText("");
      setIsLoading(false);
      eventSourceRef.current?.close();

      // Optional: trigger avatar/video/emotion stuff
      if (result.emoCtx?.emotion) {
        // emit("emoCtx", result.emoCtx);
      }
      if (result.emoCtx?.action) {
        // pushVideo(result.emoCtx.action);
      }
    });

    eventSourceRef.current.onerror = () => {
      setIsLoading(false);
      setStreamingText("");
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Try again?" }]);
      eventSourceRef.current?.close();
    };
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessage = (content) => {
    const html = marked.parse(content);
    return { __html: DOMPurify.sanitize(html) };
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-black/60 via-black/30 to-black/60 backdrop-blur-3xl">
      {/* Messages Area */}
      <div className="flex-1 flex flex-col justify-end min-h-0 overflow-y-auto px-4 py-2 space-y-6 scrollbar-thin scrollbar-thumb-white/20">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-prose px-5 py-4 rounded-2xl shadow-lg border ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-purple-600 to-pink-600 border-purple-500/50 text-white"
                  : "bg-gray-800/80 border-white/10 text-gray-100"
              }`}
              dangerouslySetInnerHTML={renderMessage(msg.content)}
            />
          </div>
        ))}

        {/* Streaming message */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="px-5 py-4 rounded-2xl bg-gray-800/80 border border-white/10 text-gray-100 max-w-prose">
              <span dangerouslySetInnerHTML={renderMessage(streamingText)} />
              <span className="inline-block w-2 h-5 bg-cyan-400 animate-pulse ml-1" />
            </div>
          </div>
        )}

        {/* Loading dots */}
        {isLoading && !streamingText && (
          <div className="flex justify-start">
            <div className="px-5 py-4 rounded-2xl bg-gray-800/80 border border-white/10">
              <div className="flex space-x-2">
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {!userAgentWallet && (
        <div className="p-6 text-center">
          <button
            onClick={async () => {
              try {
                // 1. Request wallet
                if (!window.ethereum) {
                  alert("No wallet found");
                  return;
                }

                const provider = new BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const address = await signer.getAddress();

                const message = `
                  PerspectiveAI Agent Connect.
                  Address: ${address}
                  Nonce: ${nonce}
                `.trim();

                console.log("message",message)

                const signature = await signer.signMessage(message);

                console.log("signature",signature)

                const result = await fetch("/claim", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ address, signature, message }),
                }).then(r => r.json());

                if (result?.token) {
                  setUserAgentWallet(address);
                  localStorage.setItem("pai_agent_auth_token", result.token);
                } else {
                  alert("Signature invalid");
                }
              } catch (err) {
                console.error(err);
                alert("Wallet login failed");
              }
            }}
            className="px-10 py-5 text-lg font-bold bg-gradient-to-r from-cyan-500 to-purple-600 rounded-3xl text-white shadow-xl hover:scale-105 transition"
          >
            Claim Agent
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 lg:p-6 xl:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            {/* Main input pill */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              rows={1}
              disabled={isLoading}
              className={`
                w-full resize-none rounded-full
                bg-black/40 backdrop-blur-2xl
                border border-white/20
                text-white placeholder-gray-400
                px-6 py-4 pr-16
                focus:outline-none focus:ring-2 focus:ring-cyan-500/50
                focus:border-cyan-500/50
                transition-all duration-200
                shadow-2xl shadow-black/50
                scrollbar-hide
                text-base leading-relaxed
                ${isLoading ? 'cursor-not-allowed opacity-70' : ''}
              `}
              style={{ fieldSizing: "content" }} // modern browsers auto-grow
              onInput={(e) => {
                e.target.style.height = "auto";
                //e.target.style.height = e.target.scrollHeight + "px";
              }}
            />

            {/* Send button — floating inside on the right */}
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className={`
                absolute right-2 top-1/2 -translate-y-1/2
                w-12 h-12 rounded-full
                flex items-center justify-center
                transition-all duration-300
                ${input.trim() && !isLoading
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/50 scale-100'
                  : 'bg-gray-700/50 scale-90'
                }
                ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'}
              `}
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-xs text-white/70" />
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth={2.5} d="M5 12h14m-7-7l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>

          {/* Optional subtle hint text below */}
          <p className="text-center text-xs text-gray-500 mt-3 opacity-70">
            Shift + Enter for new line • Press ↑ to send
          </p>
        </div>
      </div>
    </div>
  );
}
