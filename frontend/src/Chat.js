import ReactMarkdown from "react-markdown";
import { useState, useRef, useEffect } from "react";
import axios from "axios";

function Chat() {

    const [question, setQuestion] = useState("");
    const [loading, setLoading] = useState(false);

    const [messages, setMessages] = useState([
        {
            role: "assistant",
            text: "👋 Hi! I'm your AI Email Assistant. Ask me anything about your emails."
        }
    ]);

    const bottomRef = useRef(null);

    useEffect(() => {

        bottomRef.current?.scrollIntoView({
            behavior: "smooth"
        });

    }, [messages, loading]);

    const askQuestion = async () => {

        if (!question.trim() || loading) return;

        const userQuestion = question;

        setMessages(prev => [
            ...prev,
            {
                role: "user",
                text: userQuestion
            }
        ]);

        setQuestion("");
        setLoading(true);

        try {

            const res = await axios.post(
                "http://127.0.0.1:5000/chat",
                {
                    question: userQuestion
                }
            );

            setMessages(prev => [
                ...prev,
                {
                    role: "assistant",
                    text: res.data.answer
                }
            ]);

        } catch (err) {

            console.error(err);

            setMessages(prev => [
                ...prev,
                {
                    role: "assistant",
                    text: "❌ Something went wrong while contacting the backend."
                }
            ]);

        } finally {

            setLoading(false);

        }

    };

    return (

        <div
            style={{
                maxWidth: "1000px",
                margin: "30px auto",
                fontFamily: "Arial"
            }}
        >

            <h1>🤖 AI Email Assistant</h1>

            <div
                style={{
                    height: "550px",
                    overflowY: "auto",
                    border: "1px solid #ddd",
                    borderRadius: "12px",
                    padding: "20px",
                    background: "#fafafa"
                }}
            >

                {messages.map((msg, index) => (

                    <div
                        key={index}
                        style={{
                            display: "flex",
                            justifyContent:
                                msg.role === "user"
                                    ? "flex-end"
                                    : "flex-start",
                            marginBottom: "15px"
                        }}
                    >

                        <div
                            style={{
                                background:
                                    msg.role === "user"
                                        ? "#1976d2"
                                        : "#e8e8e8",

                                color:
                                    msg.role === "user"
                                        ? "white"
                                        : "black",

                                padding: "15px",
                                borderRadius: "16px",
                                maxWidth: "75%",
                                lineHeight: "1.6",
                                boxShadow: "0px 2px 8px rgba(0,0,0,0.08)"
                            }}
                        >

                            <ReactMarkdown>
                                {msg.text}
                            </ReactMarkdown>

                        </div>

                    </div>

                ))}

                {loading && (

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-start",
                            marginBottom: "15px"
                        }}
                    >

                        <div
                            style={{
                                background: "#e8e8e8",
                                padding: "15px",
                                borderRadius: "16px"
                            }}
                        >

                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px"
                                }}
                            >

                                <div className="typing">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>

                                <b>AI is thinking...</b>

                            </div>

                        </div>

                    </div>

                )}

                <div ref={bottomRef}></div>

            </div>

            <div
                style={{
                    display: "flex",
                    marginTop: "20px",
                    gap: "10px"
                }}
            >

                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {

                        if (e.key === "Enter") {

                            askQuestion();

                        }

                    }}
                    placeholder="Ask anything about your emails..."
                    style={{
                        flex: 1,
                        padding: "15px",
                        fontSize: "16px",
                        borderRadius: "10px",
                        border: "1px solid #ccc"
                    }}
                />

                <button
                    onClick={askQuestion}
                    disabled={loading}
                    style={{
                        width: "120px",
                        border: "none",
                        borderRadius: "10px",
                        background: "#1976d2",
                        color: "white",
                        fontWeight: "bold",
                        cursor: loading ? "not-allowed" : "pointer"
                    }}
                >

                    {loading ? "Thinking..." : "Send"}

                </button>

            </div>

        </div>

    );

}

export default Chat;