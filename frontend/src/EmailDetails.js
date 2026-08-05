import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";

import {
  Box,
  Paper,
  Typography,
  Chip,
  CircularProgress,
  Button,
  Divider,
  Grid,
  TextField,
  Stack,
  alpha,
} from "@mui/material";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DescriptionIcon from "@mui/icons-material/Description";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ReplyIcon from "@mui/icons-material/Reply";
import PersonIcon from "@mui/icons-material/Person";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import SendIcon from "@mui/icons-material/Send";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import CategoryIcon from "@mui/icons-material/Category";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EmailIcon from "@mui/icons-material/Email";

function EmailDetails() {
  const { id } = useParams();

  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");

  useEffect(() => {
    fetch(`http://127.0.0.1:5000/email/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setEmail(data.email);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "70vh",
        }}
      >
        <CircularProgress size={50} thickness={3} sx={{ color: "#3B82F6" }} />
      </Box>
    );
  }

  if (!email) {
    return (
      <Box sx={{ p: 5, textAlign: "center" }}>
        <EmailIcon sx={{ fontSize: 64, color: "rgba(255, 255, 255, 0.3)", mb: 2 }} />
        <Typography variant="h4" fontWeight="700">
          Email not found
        </Typography>
      </Box>
    );
  }

  const generateReply = (tone) => {
    axios
      .post("http://127.0.0.1:5000/reply", {
        body: email.body,
        tone: tone,
      })
      .then((res) => {
        setReply(res.data.reply);
        toast.success(`Generated ${tone} reply`);
      });
  };

  const sendReply = async () => {
    try {
      await axios.post("http://127.0.0.1:5000/send-reply", {
        to: email.sender,
        subject: email.subject,
        body: reply,
      });

      toast.success(
        <>
          <strong>Reply Sent Successfully</strong>
        </>,
        {
          autoClose: 4000,
          position: "top-right",
        }
      );
    } catch (err) {
      toast.error(
        <>
          <strong>Failed to Send</strong>
        </>,
        {
          autoClose: 4000,
          position: "top-right",
        }
      );
      console.error(err);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "High":
        return { color: "#EF4444", bgColor: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)" };
      case "Medium":
        return { color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)" };
      case "Low":
        return { color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.15)", borderColor: "rgba(34, 197, 94, 0.3)" };
      default:
        return { color: "#9CA3AF", bgColor: "rgba(156, 163, 175, 0.15)", borderColor: "rgba(156, 163, 175, 0.3)" };
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case "Job":
        return { color: "#3B82F6", bgColor: "rgba(59, 130, 246, 0.15)" };
      case "Internship":
        return { color: "#8B5CF6", bgColor: "rgba(139, 92, 246, 0.15)" };
      case "Promotion":
        return { color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.15)" };
      default:
        return { color: "#9CA3AF", bgColor: "rgba(156, 163, 175, 0.15)" };
    }
  };

  const priorityData = getPriorityColor(email.priority);
  const categoryData = getCategoryColor(email.category);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Back Button */}
      <Button
        component={Link}
        to="/inbox"
        startIcon={<ArrowBackIcon />}
        sx={{
          mb: 3,
          borderRadius: "14px",
          px: 2,
          py: 1,
          fontWeight: 600,
          color: "rgba(255, 255, 255, 0.7)",
          bgcolor: "rgba(255, 255, 255, 0.05)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          "&:hover": {
            bgcolor: "rgba(255, 255, 255, 0.1)",
            color: "#fff",
          },
        }}
      >
        Back to Inbox
      </Button>

      {/* Main Content */}
      <Paper
        sx={{
          p: 4,
          background: "rgba(20, 25, 45, 0.55)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "20px",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
        }}
      >
        {/* Header */}
        <Typography variant="h1" fontWeight="800" sx={{ letterSpacing: "-0.5px", mb: 2 }}>
          {email.subject}
        </Typography>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={3}>
          <Box display="flex" alignItems="center" gap={1}>
            <PersonIcon sx={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 18 }} />
            <Typography variant="body2" color="rgba(255, 255, 255, 0.7)">
              {email.sender}
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <CalendarTodayIcon sx={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 18 }} />
            <Typography variant="body2" color="rgba(255, 255, 255, 0.7)">
              {email.date || "-"}
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ mb: 4, borderColor: "rgba(255, 255, 255, 0.08)" }} />

        <Grid container spacing={3}>
          {/* Left Column - Email Body */}
          <Grid item xs={12} md={8}>
            <Paper
              sx={{
                p: 4,
                background: "rgba(15, 20, 35, 0.5)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "18px",
                boxShadow: "none",
              }}
            >
              <Box display="flex" alignItems="center" gap={1.5} mb={3}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: "10px",
                    bgcolor: "rgba(59, 130, 246, 0.15)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DescriptionIcon sx={{ color: "#60A5FA", fontSize: 20 }} />
                </Box>
                <Typography variant="h4" fontWeight="700">
                  Email Body
                </Typography>
              </Box>

              <Divider sx={{ mb: 3, borderColor: "rgba(255, 255, 255, 0.08)" }} />

              <Box
                sx={{
                  maxHeight: 500,
                  overflowY: "auto",
                  p: 3,
                  background: "rgba(11, 17, 32, 0.5)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "16px",
                  whiteSpace: "pre-wrap",
                  fontSize: 15,
                  lineHeight: 1.8,
                  color: "rgba(255, 255, 255, 0.85)",
                }}
              >
                {email.body}
              </Box>
            </Paper>
          </Grid>

          {/* Right Column - AI Analysis */}
          <Grid item xs={12} md={4}>
            <Paper
              sx={{
                p: 4,
                background: "rgba(15, 20, 35, 0.5)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "18px",
                boxShadow: "none",
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={1.5}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "10px",
                      bgcolor: "rgba(139, 92, 246, 0.15)",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <PsychologyIcon sx={{ color: "#A78BFA", fontSize: 20 }} />
                  </Box>
                  <Typography variant="h4" fontWeight="700">
                    AI Analysis
                  </Typography>
                </Box>
                <Typography variant="caption" color="rgba(255, 255, 255, 0.5)">
                  Generated just now
                </Typography>
              </Stack>

              <Divider sx={{ mb: 3, borderColor: "rgba(255, 255, 255, 0.08)" }} />

              {/* Summary */}
              <Box mb={3}>
                <Typography
                  variant="caption"
                  fontWeight="700"
                  color="rgba(255, 255, 255, 0.5)"
                  sx={{ letterSpacing: "0.5px", mb: 1, display: "block" }}
                >
                  SUMMARY
                </Typography>
                <Typography sx={{ lineHeight: 1.7, color: "rgba(255, 255, 255, 0.85)" }}>
                  {email.summary || "Generating AI Summary..."}
                </Typography>
              </Box>

              <Divider sx={{ my: 3, borderColor: "rgba(255, 255, 255, 0.08)" }} />

              {/* Meta Info Grid */}
              <Grid container spacing={2} mb={3}>
                <Grid item xs={4}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: "14px",
                      bgcolor: categoryData.bgColor,
                      border: `1px solid ${alpha(categoryData.color, 0.2)}`,
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <CategoryIcon sx={{ fontSize: 16, color: categoryData.color }} />
                      <Typography variant="caption" color="rgba(255, 255, 255, 0.5)" fontWeight="600">
                        Category
                      </Typography>
                    </Box>
                    <Typography fontWeight="700" color={categoryData.color}>
                      {email.category || "Other"}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: "14px",
                      bgcolor: priorityData.bgColor,
                      border: `1px solid ${priorityData.borderColor}`,
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <PriorityHighIcon sx={{ fontSize: 16, color: priorityData.color }} />
                      <Typography variant="caption" color="rgba(255, 255, 255, 0.5)" fontWeight="600">
                        Priority
                      </Typography>
                    </Box>
                    <Typography fontWeight="700" color={priorityData.color}>
                      {email.priority || "Unknown"}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: "14px",
                      bgcolor: "rgba(59, 130, 246, 0.1)",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <ScheduleIcon sx={{ fontSize: 16, color: "#60A5FA" }} />
                      <Typography variant="caption" color="rgba(255, 255, 255, 0.5)" fontWeight="600">
                        Deadline
                      </Typography>
                    </Box>
                    <Typography fontWeight="700" color="#60A5FA">
                      {email.deadline || "-"}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              <Divider sx={{ my: 3, borderColor: "rgba(255, 255, 255, 0.08)" }} />

              {/* Next Action */}
              <Box mb={3}>
                <Typography
                  variant="subtitle2"
                  fontWeight="700"
                  color="rgba(255, 255, 255, 0.7)"
                  mb={1.5}
                >
                  Recommended Action
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                    label="Apply Immediately"
                    sx={{
                      bgcolor: "rgba(34, 197, 94, 0.15)",
                      color: "#4ADE80",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                      borderRadius: "12px",
                      fontWeight: 600,
                    }}
                  />
                  {email.deadline && (
                    <Chip
                      icon={<ScheduleIcon sx={{ fontSize: 16 }} />}
                      label={`Due: ${email.deadline}`}
                      sx={{
                        bgcolor: "rgba(59, 130, 246, 0.15)",
                        color: "#60A5FA",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        borderRadius: "12px",
                        fontWeight: 600,
                      }}
                    />
                  )}
                </Stack>
              </Box>

              <Divider sx={{ my: 3, borderColor: "rgba(255, 255, 255, 0.08)" }} />

              {/* Generate Reply */}
              <Box>
                <Typography
                  variant="subtitle2"
                  fontWeight="700"
                  color="rgba(255, 255, 255, 0.7)"
                  mb={1.5}
                >
                  Generate Reply
                </Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  {["Professional", "Friendly", "Short"].map((tone) => (
                    <Button
                      key={tone}
                      variant="outlined"
                      onClick={() => generateReply(tone)}
                      sx={{
                        borderRadius: "12px",
                        px: 2,
                        py: 1,
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        bgcolor: "rgba(255, 255, 255, 0.05)",
                        borderColor: "rgba(255, 255, 255, 0.15)",
                        color: "#fff",
                        "&:hover": {
                          bgcolor: "rgba(59, 130, 246, 0.15)",
                          borderColor: "#3B82F6",
                        },
                      }}
                    >
                      {tone}
                    </Button>
                  ))}
                </Stack>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Paper>

      {/* Reply Section */}
      <Paper
        sx={{
          p: 4,
          mt: 3,
          background: "rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(22px)",
          WebkitBackdropFilter: "blur(22px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "24px",
          boxShadow: "0 8px 40px rgba(0, 0, 0, 0.35)",
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5} mb={3}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              bgcolor: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ReplyIcon sx={{ color: "#4ADE80", fontSize: 20 }} />
          </Box>
          <Typography variant="h4" fontWeight="700">
            AI Reply
          </Typography>
        </Box>

        <TextField
          multiline
          rows={10}
          fullWidth
          value={reply}
          placeholder="Click a tone button above to generate a reply, or type your own..."
          onChange={(e) => setReply(e.target.value)}
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
              lineHeight: 1.7,
            },
          }}
        />

        <Box display="flex" gap={2} mt={3}>
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={() => {
              navigator.clipboard.writeText(reply);
              toast.success("Copied to clipboard");
            }}
            sx={{
              borderRadius: "14px",
              px: 3,
              py: 1.5,
              fontWeight: 600,
              bgcolor: "rgba(255, 255, 255, 0.05)",
              borderColor: "rgba(255, 255, 255, 0.15)",
              color: "#fff",
              "&:hover": {
                bgcolor: "rgba(255, 255, 255, 0.1)",
                borderColor: "rgba(255, 255, 255, 0.25)",
              },
            }}
          >
            Copy Reply
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<SendIcon />}
            onClick={sendReply}
            sx={{
              borderRadius: "14px",
              px: 4,
              py: 1.5,
              fontWeight: 600,
              background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
              boxShadow: "0 4px 20px rgba(34, 197, 94, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              "&:hover": {
                background: "linear-gradient(135deg, #16A34A 0%, #15803D 100%)",
                boxShadow: "0 8px 30px rgba(34, 197, 94, 0.6)",
              },
            }}
          >
            Send Reply
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default EmailDetails;
