import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import socket from "./socket";

import {
  Box,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Grid,
  Chip,
  Avatar,
  CircularProgress,
  InputAdornment,
  Select,
  FormControl,
  InputLabel,
  Stack,
  IconButton,
  alpha,
  Fade,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import ScheduleIcon from "@mui/icons-material/Schedule";
import MarkEmailUnreadIcon from "@mui/icons-material/MarkEmailUnread";
import MailOutlineIcon from "@mui/icons-material/MailOutline";

function Inbox() {
  const navigate = useNavigate();

  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [account, setAccount] = useState("");
  const [accounts, setAccounts] = useState([]);

  const loadEmails = useCallback(() => {
    setLoading(true);
    axios
      .get("http://127.0.0.1:5000/emails", {
        params: { search, category, priority, account },
      })
      .then((res) => {
        setEmails(res.data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [search, category, priority, account]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  useEffect(() => {
    axios.get("http://127.0.0.1:5000/gmail/accounts").then((res) => {
      setAccounts(res.data || []);
    });
  }, []);

  useEffect(() => {
    socket.on("gmail_update", () => loadEmails());
    return () => socket.off("gmail_update");
  }, [loadEmails]);

  const getPriorityProps = (p) => {
    switch (p) {
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

  const getCategoryColor = (cat) => {
    switch (cat) {
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

  return (
    <Box sx={{ width: "100%", maxWidth: "1400px", mx: "auto" }}>
      {/* Header */}
      <Box mb={4}>
        <Box display="flex" alignItems="center" gap={1.5} mb={1}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "14px",
              background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(59, 130, 246, 0.4)",
            }}
          >
            <MailOutlineIcon sx={{ color: "#fff", fontSize: 24 }} />
          </Box>
          <Typography variant="h1" fontWeight="800" sx={{ letterSpacing: "-1px", fontSize: "2rem" }}>
            Inbox
          </Typography>
        </Box>
        <Typography color="rgba(255, 255, 255, 0.6)" variant="body1" ml={7}>
          AI curated and analyzed emails, prioritized for you.
        </Typography>
      </Box>

      {/* Filter Panel */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 4,
          background: "rgba(20, 25, 45, 0.55)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "20px",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <TextField
              fullWidth
              placeholder="Search emails, senders, subjects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "rgba(255, 255, 255, 0.5)" }} />
                  </InputAdornment>
                ),
                sx: {
                  borderRadius: "16px",
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    bgcolor: "rgba(255, 255, 255, 0.08)",
                  },
                  "&.Mui-focused": {
                    bgcolor: "rgba(59, 130, 246, 0.08)",
                  },
                },
              }}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2.5}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: "rgba(255, 255, 255, 0.5)" }}>Account</InputLabel>
              <Select
                value={account}
                label="Account"
                onChange={(e) => setAccount(e.target.value)}
                sx={{
                  borderRadius: "16px",
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    bgcolor: "rgba(255, 255, 255, 0.08)",
                  },
                  "&.Mui-focused": {
                    bgcolor: "rgba(59, 130, 246, 0.08)",
                  },
                }}
              >
                <MenuItem value="">All Accounts</MenuItem>
                {accounts.map((a) => (
                  <MenuItem key={a.id} value={a.email}>
                    {a.email}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={4} md={2.25}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: "rgba(255, 255, 255, 0.5)" }}>Category</InputLabel>
              <Select
                value={category}
                label="Category"
                onChange={(e) => setCategory(e.target.value)}
                sx={{
                  borderRadius: "16px",
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    bgcolor: "rgba(255, 255, 255, 0.08)",
                  },
                  "&.Mui-focused": {
                    bgcolor: "rgba(59, 130, 246, 0.08)",
                  },
                }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="Job">Job</MenuItem>
                <MenuItem value="Internship">Internship</MenuItem>
                <MenuItem value="Promotion">Promotion</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={4} md={2.25}>
            <FormControl fullWidth>
              <InputLabel sx={{ color: "rgba(255, 255, 255, 0.5)" }}>Priority</InputLabel>
              <Select
                value={priority}
                label="Priority"
                onChange={(e) => setPriority(e.target.value)}
                sx={{
                  borderRadius: "16px",
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    bgcolor: "rgba(255, 255, 255, 0.08)",
                  },
                  "&.Mui-focused": {
                    bgcolor: "rgba(59, 130, 246, 0.08)",
                  },
                }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="High">High</MenuItem>
                <MenuItem value="Medium">Medium</MenuItem>
                <MenuItem value="Low">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Email List */}
      {loading ? (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "50vh",
          }}
        >
          <CircularProgress size={50} thickness={3} sx={{ color: "#3B82F6" }} />
        </Box>
      ) : (
        <Stack spacing={2}>
          {emails.length === 0 ? (
            <Paper
              sx={{
                p: 8,
                textAlign: "center",
                borderRadius: "24px",
                background: "rgba(255, 255, 255, 0.08)",
                backdropFilter: "blur(22px)",
                WebkitBackdropFilter: "blur(22px)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: "0 8px 40px rgba(0, 0, 0, 0.35)",
              }}
            >
              <MarkEmailUnreadIcon
                sx={{ fontSize: 64, color: "rgba(255, 255, 255, 0.3)", mb: 2 }}
              />
              <Typography variant="h5" fontWeight="700" color="rgba(255, 255, 255, 0.8)" mb={1}>
                No emails found
              </Typography>
              <Typography variant="body2" color="rgba(255, 255, 255, 0.5)">
                Try adjusting your search or filters
              </Typography>
            </Paper>
          ) : (
            emails.map((email, index) => {
              const priorityData = getPriorityProps(email.priority);
              const categoryData = getCategoryColor(email.category);
              
              return (
                <Fade in key={email.id || index} timeout={300 + index * 50}>
                  <Paper
                    onClick={() => email.id && navigate(`/email/${email.id}`)}
                    sx={{
                      p: 3,
                      borderRadius: "24px",
                      minHeight: 120,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      background: "rgba(255, 255, 255, 0.08)",
                      backdropFilter: "blur(22px)",
                      WebkitBackdropFilter: "blur(22px)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      boxShadow: "0 8px 40px rgba(0, 0, 0, 0.35)",
                      transition: "all 0.3s ease",
                      "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: "0 15px 50px rgba(0, 0, 0, 0.45)",
                        borderColor: "rgba(255, 255, 255, 0.18)",
                        background: "rgba(255, 255, 255, 0.12)",
                      },
                    }}
                  >
                    {/* Avatar */}
                    <Avatar
                      sx={{
                        width: 56,
                        height: 56,
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        background: `linear-gradient(135deg, ${categoryData.color} 0%, ${alpha(categoryData.color, 0.7)} 100%)`,
                        color: "#fff",
                        border: "2px solid rgba(255, 255, 255, 0.15)",
                        boxShadow: `0 4px 16px ${alpha(categoryData.color, 0.4)}`,
                        flexShrink: 0,
                      }}
                    >
                      {email.sender ? email.sender.charAt(0).toUpperCase() : "?"}
                    </Avatar>

                    {/* Content */}
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Box display="flex" alignItems="center" gap={1.5} mb={0.75}>
                        <Typography
                          noWrap
                          fontWeight="700"
                          sx={{
                            fontSize: "1.1rem",
                            color: "#fff",
                            flex: "0 1 auto",
                          }}
                        >
                          {email.subject}
                        </Typography>
                        {email.category && (
                          <Chip
                            label={email.category}
                            size="small"
                            sx={{
                              height: 24,
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              bgcolor: categoryData.bgColor,
                              color: categoryData.color,
                              border: `1px solid ${alpha(categoryData.color, 0.3)}`,
                              borderRadius: "8px",
                            }}
                          />
                        )}
                      </Box>

                      <Typography
                        noWrap
                        variant="body2"
                        color="rgba(255, 255, 255, 0.5)"
                        mb={1}
                        sx={{ fontSize: "0.85rem" }}
                      >
                        {email.sender}
                        <Box
                          component="span"
                          sx={{
                            mx: 1,
                            color: "rgba(255, 255, 255, 0.3)",
                          }}
                        >
                          •
                        </Box>
                        {email.account_email}
                      </Typography>

                      <Box display="flex" alignItems="center" gap={1}>
                        <AutoAwesomeIcon
                          sx={{ fontSize: 16, color: "#60A5FA" }}
                        />
                        <Typography
                          noWrap
                          variant="body2"
                          sx={{
                            color: "rgba(255, 255, 255, 0.6)",
                            fontStyle: "italic",
                            maxWidth: { xs: "200px", md: "600px" },
                            fontSize: "0.85rem",
                          }}
                        >
                          {email.summary || "Generating AI Summary..."}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Right Side */}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 1,
                        minWidth: 120,
                        flexShrink: 0,
                      }}
                    >
                      {email.priority && (
                        <Chip
                          icon={<PriorityHighIcon sx={{ fontSize: 14 }} />}
                          label={email.priority}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            borderRadius: "10px",
                            bgcolor: priorityData.bgColor,
                            color: priorityData.color,
                            border: `1px solid ${priorityData.borderColor}`,
                            height: 26,
                            fontSize: "0.75rem",
                          }}
                        />
                      )}
                      {email.deadline && (
                        <Chip
                          icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
                          label={email.deadline}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            borderRadius: "10px",
                            bgcolor: "rgba(255, 255, 255, 0.05)",
                            color: "rgba(255, 255, 255, 0.7)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            height: 26,
                            fontSize: "0.75rem",
                          }}
                        />
                      )}
                    </Box>

                    {/* Arrow Icon */}
                    <IconButton
                      sx={{
                        display: { xs: "none", sm: "flex" },
                        color: "rgba(255, 255, 255, 0.3)",
                        borderRadius: "12px",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <ChevronRightIcon />
                    </IconButton>
                  </Paper>
                </Fade>
              );
            })
          )}
        </Stack>
      )}
    </Box>
  );
}

export default Inbox;
