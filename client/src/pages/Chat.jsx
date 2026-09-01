import { useEffect, useRef, useState } from "react";
import { api, getUser } from "../api.js";
import { canUseFeature } from "../permissions.js";

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [callContact, setCallContact] = useState(null);
  const bottomRef = useRef(null);
  const me = getUser();
  const canWrite = canUseFeature(me, "chat", "write");

  function load() {
    api.get("/chat").then(setMessages).catch(() => {});
  }

  useEffect(() => {
    load();
    api.get("/settings").then((s) => {
      if (s.dedicated_call_phone) setCallContact({ name: s.dedicated_call_name, phone: s.dedicated_call_phone });
    }).catch(() => {});
    const interval = setInterval(load, 4000); // simple polling; swap for websockets later
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await api.post("/chat", { message: text.trim() });
    setText("");
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Chat Box</h1>
          <p>Shared office channel for staff coordination</p>
        </div>
        {callContact && (
          <a className="primary" style={{ textDecoration: "none", padding: "8px 16px", borderRadius: 8, background: "var(--green)", color: "#fff", fontWeight: 600, fontSize: "0.9rem" }}
            href={`tel:${callContact.phone}`}>
            📞 Call {callContact.name || "dedicated support"}
          </a>
        )}
      </div>

      <div className="card chat-box">
        <div className="chat-messages">
          {messages.map((m) => (
            <div key={m.id} className="chat-msg">
              <div className="sender">{m.sender_id === me?.id ? "You" : m.sender_name} · {new Date(m.created_at).toLocaleTimeString()}</div>
              <div className="bubble">{m.message}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form className="chat-input-row" onSubmit={handleSend} style={!canWrite ? { display: "none" } : undefined}>
          <input
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="primary" type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}
