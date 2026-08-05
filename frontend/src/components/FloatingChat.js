import { useState } from "react";
import axios from "axios";

import {
  Fab,
  Paper,
  TextField,
  Typography,
  Box,
  IconButton,
  CircularProgress,
  Avatar,
  Stack,
  alpha,
} from "@mui/material";

import SmartToyIcon from "@mui/icons-material/SmartToy";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "👋 Hi! I'm your AI Email Copilot. Ask me anything about your emails.",
    },
  ]);
  const [loading, setLoading] = useState(false);

  const askQuestion = async () => {
    if (!question.trim()) return;

    const userQuestion = question;
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: userQuestion,
      },
    ]);

    setQuestion("");
    setLoading(true);

    try {
      const res = await axios.post("http://127.0.0.1:5000/chat", {
        question: userQuestion,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.data.answer,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "❌ AI service unavailable. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <Fab
        onClick={() => setOpen(!open)}
        sx={{
          position: "fixed",
          bottom: { xs: 20, md: 28 },
          right: { xs: 20, md: 28 },
          zIndex: 9999,
          width: { xs: 62, md: 68 },
          height: { xs: 62, md: 68 },
          background: open
            ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
            : "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
          boxShadow: open
            ? "0 8px 30px rgba(239, 68, 68, 0.5)"
            : "0 8px 30px rgba(59, 130, 246, 0.5)",
          border: "2px solid rgba(255, 255, 255, 0.2)",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          "&:hover": {
            transform: "scale(1.1)",
            boxShadow: open
              ? "0 12px 40px rgba(239, 68, 68, 0.7)"
              : "0 12px 40px rgba(59, 130, 246, 0.7)",
          },
        }}
      >
        {open ? (
          <CloseIcon sx={{ fontSize: 32, color: "#fff" }} />
        ) : (
          <SmartToyIcon sx={{ fontSize: 32, color: "#fff" }} />
        )}
      </Fab>

      {/* Chat Window */}
      {open && (
        <Paper
          elevation={0}
          sx={{
            position: "fixed",
            bottom: { xs: 96, md: 108 },
            right: { xs: 16, md: 28 },
            width: { xs: "calc(100vw - 32px)", sm: 380, md: 400 },
            height: { xs: 480, md: 540 },
            display: "flex",
            flexDirection: "column",
            background: "rgba(15, 20, 35, 0.95)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "24px",
            overflow: "hidden",
            zIndex: 9999,
            boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2.5,
              background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "12px",
                bgcolor: "rgba(255, 255, 255, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AutoAwesomeIcon sx={{ color: "#fff", fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight="700" color="#fff">
                AI Email Copilot
              </Typography>
              <Typography variant="caption" sx={{ color: "rgba(255, 255, 255, 0.7)" }}>
                Powered by GPT
              </Typography>
            </Box>
          </Box>

          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              overflowY: "auto",
              p: 2.5,
              bgcolor: "rgba(10, 15, 30, 0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {messages.map((msg, index) => (
              <Box
                key={index}
                sx={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {msg.role === "assistant" && (
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      bgcolor: "rgba(59, 130, 246, 0.2)",
                      color: "#60A5FA",
                      mr: 1,
                      fontSize: "0.85rem",
                      fontWeight: 700,
                    }}
                  >
                    <AutoAwesomeIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                )}
                <Paper
                  sx={{
                    p: 2,
                    maxWidth: "75%",
                    bgcolor:
                      msg.role === "user"
                        ? "linear-gradient(135deg, #5B8CFF 0%, #3B6BE0 100%)"
                        : "rgba(20, 25, 45, 0.5)",
                    color: "#fff",
                    borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                    border: msg.role === "user" ? "none" : "1px solid rgba(255, 255, 255, 0.06)",
                    boxShadow: "none",
                    fontSize: "0.9rem",
                    lineHeight: 1.6,
                  }}
                >
                  {msg.text}
                </Paper>
              </Box>
            ))}
            {loading && (
              <Box display="flex" justifyContent="flex-start">
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: "rgba(59, 130, 246, 0.2)",
                    color: "#60A5FA",
                    mr: 1,
                  }}
                >
                  <AutoAwesomeIcon sx={{ fontSize: 18 }} />
                </Avatar>
                <Paper
                  sx={{
                    p: 2,
                    borderRadius: "20px 20px 20px 4px",
                    bgcolor: "rgba(20, 25, 45, 0.5)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                  }}
                >
                  <Box className="typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </Box>
                </Paper>
              </Box>
            )}
          </Box>

          {/* Input */}
          <Box
            sx={{
              p: 2,
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              gap: 1.5,
              bgcolor: "rgba(17, 24, 39, 0.5)",
            }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder="Ask me anything..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  askQuestion();
                }
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  borderRadius: "16px",
                  "& fieldset": {
                    borderColor: "rgba(255, 255, 255, 0.1)",
                  },
                  "&:hover fieldset": {
                    borderColor: "rgba(255, 255, 255, 0.2)",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#3B82F6",
                  },
                },
                "& .MuiInputBase-input": {
                  color: "#fff",
                  fontSize: "0.9rem",
                },
              }}
            />
            <IconButton
              onClick={askQuestion}
              disabled={!question.trim() || loading}
              sx={{
                bgcolor: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
                color: "#fff",
                borderRadius: "14px",
                width: 48,
                height: 48,
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
                boxShadow: "0 4px 16px rgba(59, 130, 246, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                "&:hover": {
                  background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                  boxShadow: "0 6px 20px rgba(59, 130, 246, 0.6)",
                },
                "&:disabled": {
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "rgba(255, 255, 255, 0.3)",
                  boxShadow: "none",
                },
              }}
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </Box>
        </Paper>
      )}
    </>
  );
}

export default FloatingChat;
