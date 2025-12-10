//import React, { useState } from "react";
import React, { useState, useEffect, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { BrowserProvider } from "ethers";
import Message from "./Message";
import ModalController from "./ModalController"
import InlineController from "./InlineController"


export default function Chat({ address }) {

  const [messages, setMessages] = useState([
    { role: "assistant", type: "chat", content: "How can I help you today ?" }
  ]);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [streamingMode, setStreamingMode] = useState("chat");
  const [streamingStyle, setStreamingStyle] = useState("plain");
  const [isLoading, setIsLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [recentUploads, setRecentUploads] = useState([]);
  const [toolAction, setToolAction] = useState("");
  const toolActionRef = useRef("");
  const isLoadingRef = useRef(isLoading);
  const isFileLoadingRef = useRef(isFileLoading);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);
  const messageIdRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const [userAgentWallet, setUserAgentWallet] = useState("0x");
  const [nonce, setNonce] = useState("");

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    isFileLoadingRef.current = isFileLoading;
  }, [isFileLoading]);

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

  const handleFileUpload = async (e) => {

    const file = e.target.files?.[0];
    if (!file) return;

    // Optional: show loading state
    setIsFileLoading(true);

    const jwt = localStorage.getItem("pai_agent_auth_token");
    const formData = new FormData();
    formData.append("file", file);

    try {

      console.log("start")

      const res = await fetch("/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`
        },
        body: formData,
      });

      const data = await res.json();
      console.log("data",data)
      setRecentUploads(uploadArr => {
        const newEntry = {
          id: data.id,
          name: data.originalName || "file",
          ts: Date.now()
        };

        const updatedArr = [newEntry, ...uploadArr];
        return updatedArr.slice(0, 10);
      });

      // This is the magic line
      setInput(`File uploaded – reference ID: ${data.id}\n\n` + input);

      // Optional: auto-focus and put cursor at end
      // setTimeout(() => textareaRef.current?.focus(), 100);

    } catch (err) {
      setInput(`Upload failed. Try again.\n\n` + input);
    } finally {
      setIsFileLoading(false);
      e.target.value = ""; // reset input
    }

  };

  const nextId = () => ++messageIdRef.current;

  const sendMessage = async () => {
    if (!input.trim() || isLoadingRef.current) return;

    // check if we uploaded any files, we need to reference these in the next message.
    const fileContext = recentUploads.length > 0
    ? "\n\n: file uploads (for reference only):\n" +
      recentUploads
        .map(f => `• ID: ${f.id} – ${f.name}`)
        .join("\n")
    : "";

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [
      ...prev,
      { id: nextId(), role: "user", toolAction: "", style: "plain", type: "chat", content: userMessage },
      { id: nextId(), role: "assistant", toolAction: "", style: "plain", type: "chat", content: "" }
    ]);
    setIsLoading(true);
    setStreamingText("");

    // Load JWT
    const jwt = localStorage.getItem("pai_agent_auth_token");

    var chatQuery = `/agent?message=${encodeURIComponent(userMessage)}`;
    if (fileContext) {
      chatQuery += `&context=${encodeURIComponent(fileContext)}`;
    }
    
    if (jwt) {
      chatQuery += `&jwToken=${encodeURIComponent(jwt)}`;
    }

    // Start SSE : TODO, we should send the message via post and stream response via sse.
    eventSourceRef.current = new EventSource(chatQuery);

    setRecentUploads([]);

    // Tokens from the agent sse stream
    eventSourceRef.current.addEventListener("token", async (e) => {
      try {
        const dataStr = e.data.toString();
        const data = JSON.parse(dataStr);
        //setStreamingText(prev => prev + data.tokens.join("")); /* <-- new text streams in */
        for (const t of data.tokens) {
          if (isLoadingRef.current === true) {
            setStreamingText(prev => prev + t);
            await new Promise(r => setTimeout(r, 20)); // <-- new text streams in
          }
        }
      } catch (err) {
        console.log("Token parse error:", err);
      }
    });

    // Tool output from the stream (this is the raw tool output) - one big block (todo: review)
    eventSourceRef.current.addEventListener("tool", async (e) => {
      try {
        const dataStr = e.data.toString();
        const data = JSON.parse(dataStr);
        setStreamingStyle( // distinguish between system(config) and chat messages
          data?.msg?.kwargs?.content?.style === "code" ? "code" : "plain"
        );
        setStreamingMode( // distinguish between system(config) and chat messages
          data?.msg?.kwargs?.content?.mode === "system" ? "system" : "chat"
        );
        setToolAction(data?.msg?.kwargs?.name); // set the current tool name
        toolActionRef.current = data?.msg?.kwargs?.name;
      } catch (err) {
        console.log("Tool parse error:", err);
      }
    });

    eventSourceRef.current.addEventListener("done", (e) => {

      const result = JSON.parse(e.data);

      setIsLoading(false);
      isLoadingRef.current = false;

      // Stream new messages
      setMessages(prev => {
        const newMsgs = [...prev];
        const lastMsg = newMsgs[newMsgs.length - 1];

        console.log("debug toolAction", toolActionRef.current);

        newMsgs[newMsgs.length - 1] = {
          ...lastMsg,
          content: streamingText + (result.text || ""),
          mode: streamingMode,
          style: streamingStyle,
          toolAction: toolActionRef.current,
        };

        console.log("newMsgs[newMsgs.length - 1]",newMsgs[newMsgs.length - 1])

        return newMsgs;
      });

      setStreamingText("");
      setStreamingMode("chat");
      setStreamingStyle("plain");
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
      setMessages(prev => [...prev, { role: "assistant", style: streamingStyle, mode: streamingMode, content: "Sorry, something went wrong. Try again?" }]);
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

        {/* Complete message */}
        {messages.map((msg, i) => (
          <Message
            key={msg.id || i}
            role={msg.role}
            type={msg.type || "chat"}
            content={msg.content}
          >
            <InlineController
              key={`${i}-${msg.id}`}
              action={msg.toolAction}
            />
          </Message>
        ))}

        {/* Streaming message */}
        {streamingText && (
          <Message
            role="assistant"
            mode={streamingMode || "chat"} 
            style={streamingStyle || "chat"} 
            content={streamingText}
            streaming={true}
          />
        )}

    {/*
        <InlineController
          action={toolAction}
          enabled={false}
        />
      */}

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

                const signature = await signer.signMessage(message);

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
            <input
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileUpload}
              className="hidden"
              ref={fileInputRef}
              multiple={false} // or true if you want multi later
            />

            {/* Upload File Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className={`
                absolute left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full
                bg-white/10 hover:bg-white/20 border border-white/30
                transition-all duration-200 backdrop-blur-sm
                ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="text-white w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13"></path></svg>
            </button>

            {/* Main input area */}
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
              disabled={isLoadingRef.value || !input.trim()}
              className={`
                absolute right-2 top-1/2 -translate-y-1/2
                w-12 h-12 rounded-full
                flex items-center justify-center
                transition-all duration-300
                ${input.trim() && !isLoadingRef.value
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/50 scale-100'
                  : 'bg-gray-700/50 scale-90'
                }
                ${isLoadingRef.value ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'}
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
    {/*
      <ModalController
        action={toolAction}
      />
    */}
    </div>
  );
}
