import { useEffect, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import { toast } from "react-toastify";
import { useTheme } from "@mui/material/styles";
import { motion } from "framer-motion";

import {
  Box,
  Grid,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Chip,
  Avatar,
  Stack,
  IconButton,
  LinearProgress,
  alpha,
} from "@mui/material";

import SyncIcon from "@mui/icons-material/Sync";
import DownloadIcon from "@mui/icons-material/Download";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import SchoolIcon from "@mui/icons-material/School";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import BoltIcon from "@mui/icons-material/Bolt";
import EmailIcon from "@mui/icons-material/Email";
import ScheduleIcon from "@mui/icons-material/Schedule";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

import AnalyticsOutlinedIcon from "@mui/icons-material/AnalyticsOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

function Dashboard() {
  const theme = useTheme();
  const chartGridColor = "rgba(255, 255, 255, 0.04)";
  const chartTickColor = "rgba(255, 255, 255, 0.5)";

  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState(null);
  const [settings, setSettings] = useState({ user_name: "Abhiram" });

  const loadDashboard = () => {
    axios
      .get("http://127.0.0.1:5000/dashboard")
      .then((res) => setStats(res.data))
      .catch(console.error);
  };

  const loadInsights = () => {
    axios
      .get("http://127.0.0.1:5000/insights")
      .then((res) => setInsights(res.data))
      .catch(console.error);
  };

  const loadSettings = () => {
    axios
      .get("http://127.0.0.1:5000/settings")
      .then((res) => setSettings(res.data))
      .catch(console.error);
  };

  useEffect(() => {
    loadDashboard();
    loadInsights();
    loadSettings();
  }, []);

  const syncEmails = async () => {
    try {
      await axios.post("http://127.0.0.1:5000/sync");
      loadDashboard();
      toast.success("Gmail synchronized successfully!");
    } catch {
      toast.error("Synchronization failed.");
    }
  };

  const downloadExcel = async () => {
    try {
      const response = await axios.get("http://127.0.0.1:5000/export/excel", {
        responseType: "blob",
      });
      saveAs(response.data, "emails.xlsx");
      toast.success("Excel exported successfully!");
    } catch (err) {
      toast.error("Failed to export Excel.");
    }
  };

  if (!stats)
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

  const pieData = [
    { name: "Jobs", value: stats.jobs },
    { name: "Internships", value: stats.internships },
    { name: "High Priority", value: stats.high_priority },
  ];

  const barData = [
    { name: "Total", value: stats.total_emails },
    { name: "Jobs", value: stats.jobs },
    { name: "Interns", value: stats.internships },
    { name: "High", value: stats.high_priority },
  ];

  const pieColors = ["#3B82F6", "#8B5CF6", "#EF4444"];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const StatCardMotion = motion.create(Paper);

  const StatBox = ({ title, value, icon, color, trend }) => (
    <StatCardMotion
      elevation={0}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      whileHover={{ scale: 1.02, y: -6 }}
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        height: "100%",
        cursor: "pointer",
        background: "rgba(20, 25, 45, 0.55)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "20px",
        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
        transition: "all 0.3s ease",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background: `linear-gradient(90deg, transparent 0%, rgba(91, 140, 255, 0.3) 50%, transparent 100%)`,
          opacity: 0.6,
        },
        "&::after": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: `linear-gradient(90deg, ${color} 0%, ${alpha(color, 0.4)} 100%)`,
        },
        "&:hover": {
          boxShadow: `0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(91, 140, 255, 0.1)`,
          borderColor: "rgba(91, 140, 255, 0.15)",
        },
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" color="rgba(255, 255, 255, 0.7)" fontWeight="600">
          {title}
        </Typography>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: "16px",
            background: `linear-gradient(135deg, ${alpha(color, 0.3)} 0%, ${alpha(color, 0.15)} 100%)`,
            border: `1px solid ${alpha(color, 0.3)}`,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: color,
            boxShadow: `0 4px 16px ${alpha(color, 0.3)}`,
          }}
        >
          {icon}
        </Box>
      </Box>
      <Box>
        <Typography variant="h2" fontWeight="800" sx={{ letterSpacing: "-1px" }}>
          {value}
        </Typography>
        {trend && (
          <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
            <TrendingUpIcon sx={{ fontSize: 16, color: "#22C55E" }} />
            <Typography variant="caption" color="#22C55E" fontWeight="600">
              {trend}
            </Typography>
          </Box>
        )}
      </Box>
    </StatCardMotion>
  );

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "100%",
        p: { xs: 2, sm: 3, md: 4 },
      }}
    >
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <Box
          sx={{
            mb: 5,
            display: "flex",
            flexDirection: { xs: "column", lg: "row" },
            gap: 3,
            justifyContent: "space-between",
            alignItems: { xs: "flex-start", lg: "center" },
          }}
        >
          <Box>
            <Typography
              variant="body1"
              sx={{
                color: "#60A5FA",
                fontWeight: 600,
                mb: 1,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <BoltIcon sx={{ fontSize: 18 }} />
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </Typography>
            <Typography
              variant="h1"
              fontWeight="800"
              sx={{
                letterSpacing: "-1.5px",
                fontSize: { xs: "2rem", md: "2.5rem" },
                background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {getGreeting()}, {settings.user_name}
            </Typography>
            <Typography
              color="rgba(255, 255, 255, 0.6)"
              mt={1}
              sx={{ fontSize: "1.05rem", lineHeight: 1.6 }}
            >
              Your AI assistant has analyzed and organized your latest inbox activity.
            </Typography>
          </Box>
          <Stack
            direction="row"
            spacing={2}
            sx={{ width: { xs: "100%", lg: "auto" } }}
          >
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadExcel}
              sx={{
                flexGrow: { xs: 1, lg: 0 },
                borderRadius: "16px",
                px: 3,
                py: 1.5,
                fontWeight: 600,
                bgcolor: "rgba(255, 255, 255, 0.05)",
                borderColor: "rgba(255, 255, 255, 0.15)",
                color: "#fff",
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.1)",
                  borderColor: "rgba(255, 255, 255, 0.25)",
                  transform: "translateY(-2px)",
                },
              }}
            >
              Export
            </Button>
            <Button
              variant="contained"
              startIcon={<SyncIcon />}
              onClick={syncEmails}
              sx={{
                flexGrow: { xs: 1, lg: 0 },
                borderRadius: "16px",
                px: 3,
                py: 1.5,
                fontWeight: 600,
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
                boxShadow: "0 4px 20px rgba(59, 130, 246, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                "&:hover": {
                  background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                  boxShadow: "0 8px 30px rgba(59, 130, 246, 0.6)",
                  transform: "translateY(-2px)",
                },
              }}
            >
              Sync Now
            </Button>
          </Stack>
        </Box>
      </motion.div>

      {/* Stat Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatBox
            title="Total Analyzed"
            value={stats.total_emails}
            color="#3B82F6"
            icon={<MailOutlineIcon sx={{ fontSize: 24 }} />}
            trend="+12% this week"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatBox
            title="High Priority"
            value={stats.high_priority}
            color="#EF4444"
            icon={<WarningAmberIcon sx={{ fontSize: 24 }} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatBox
            title="Jobs Found"
            value={stats.jobs}
            color="#22C55E"
            icon={<WorkOutlineIcon sx={{ fontSize: 24 }} />}
            trend="+5 new"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatBox
            title="Internships"
            value={stats.internships}
            color="#F59E0B"
            icon={<SchoolIcon sx={{ fontSize: 24 }} />}
          />
        </Grid>
      </Grid>

      {/* Main Content */}
      <Grid container spacing={3}>
        {/* Left Column */}
        <Grid item xs={12} lg={8}>
          <Stack spacing={3}>
            {/* Volume Chart */}
            <Paper
              elevation={0}
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
              <Box display="flex" alignItems="center" gap={1.5} mb={3}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "12px",
                    bgcolor: "rgba(59, 130, 246, 0.15)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AnalyticsOutlinedIcon sx={{ color: "#60A5FA" }} />
                </Box>
                <Typography variant="h3" fontWeight="700">
                  Volume Overview
                </Typography>
              </Box>
              <Box sx={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={barData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={chartGridColor}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: chartTickColor, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      dy={10}
                    />
                    <YAxis
                      tick={{ fill: chartTickColor, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      cursor={{ fill: "rgba(255,255,255,0.02)" }}
                      contentStyle={{
                        backgroundColor: "rgba(17, 24, 39, 0.95)",
                        backdropFilter: "blur(10px)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "16px",
                        color: "#fff",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill="url(#colorGradient)"
                      radius={[8, 8, 0, 0]}
                      barSize={50}
                    />
                    <defs>
                      <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60A5FA" />
                        <stop offset="100%" stopColor="#3B82F6" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>

            {/* AI Intelligence */}
            <Paper
              elevation={0}
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
              <Box display="flex" alignItems="center" gap={1.5} mb={3}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "12px",
                    bgcolor: "rgba(139, 92, 246, 0.15)",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PsychologyOutlinedIcon sx={{ color: "#A78BFA" }} />
                </Box>
                <Typography variant="h3" fontWeight="700">
                  AI Intelligence
                </Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Box
                    sx={{
                      p: 2.5,
                      borderRadius: "16px",
                      bgcolor: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      transition: "all 0.3s ease",
                      "&:hover": {
                        bgcolor: "rgba(255, 255, 255, 0.05)",
                        borderColor: "rgba(255, 255, 255, 0.12)",
                      },
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="rgba(255, 255, 255, 0.5)"
                      fontWeight="600"
                      sx={{ letterSpacing: "0.5px" }}
                    >
                      TOP SENDER
                    </Typography>
                    <Typography variant="body1" fontWeight="600" noWrap>
                      {insights?.top_sender || "No data"}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Box
                    sx={{
                      p: 2.5,
                      borderRadius: "16px",
                      bgcolor: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      transition: "all 0.3s ease",
                      "&:hover": {
                        bgcolor: "rgba(255, 255, 255, 0.05)",
                        borderColor: "rgba(255, 255, 255, 0.12)",
                      },
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="rgba(255, 255, 255, 0.5)"
                      fontWeight="600"
                      sx={{ letterSpacing: "0.5px" }}
                    >
                      DOMINANT CATEGORY
                    </Typography>
                    <Typography variant="body1" fontWeight="600" noWrap>
                      {insights?.top_category || "No data"}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12}>
                  <Box
                    sx={{
                      p: 3,
                      borderRadius: "20px",
                      background:
                        "linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%)",
                      border: "1px solid rgba(59, 130, 246, 0.25)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 2,
                    }}
                  >
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: "14px",
                        bgcolor: "rgba(59, 130, 246, 0.2)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <AutoAwesomeIcon sx={{ color: "#60A5FA" }} />
                    </Box>
                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ color: "#60A5FA", fontWeight: 700, mb: 0.5 }}
                      >
                        AI Recommendation
                      </Typography>
                      <Typography
                        variant="body2"
                        color="rgba(255, 255, 255, 0.7)"
                        sx={{ lineHeight: 1.7 }}
                      >
                        You have {insights?.high_priority || 0} high priority emails
                        pending. It is recommended to address the next upcoming deadline
                        ({insights?.next_deadline?.subject || "None"}) immediately to
                        prevent backlog.
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Stack>
        </Grid>

        {/* Right Column */}
        <Grid item xs={12} lg={4}>
          <Stack spacing={3}>
            {/* Distribution Chart */}
            <Paper
              elevation={0}
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
              <Box display="flex" alignItems="center" gap={1.5} mb={2}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "12px",
                    bgcolor: "rgba(34, 197, 94, 0.15)",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FolderOpenOutlinedIcon sx={{ color: "#4ADE80" }} />
                </Box>
                <Typography variant="h3" fontWeight="700">
                  Distribution
                </Typography>
              </Box>
              <Box sx={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={5}
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "rgba(17, 24, 39, 0.95)",
                        backdropFilter: "blur(10px)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "16px",
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "13px", opacity: 0.9 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </Paper>

            {/* Deadlines */}
            <Paper
              elevation={0}
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
              <Box display="flex" alignItems="center" gap={1.5} mb={3}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "12px",
                    bgcolor: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <EventOutlinedIcon sx={{ color: "#FBBF24" }} />
                </Box>
                <Typography variant="h3" fontWeight="700">
                  Upcoming Deadlines
                </Typography>
              </Box>
              <Stack spacing={2}>
                {[
                  {
                    title: "Google Internship Assessment",
                    time: "Today",
                    priority: "Urgent",
                    color: "#EF4444",
                  },
                  {
                    title: "Adobe Interview Round 1",
                    time: "In 2 days",
                    priority: "Medium",
                    color: "#F59E0B",
                  },
                  {
                    title: "AWS Cloud Webinar",
                    time: "In 5 days",
                    priority: "Low",
                    color: "#22C55E",
                  },
                ].map((item, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: "flex",
                      gap: 2,
                      position: "relative",
                      pb: idx < 2 ? 2 : 0,
                      "&::after":
                        idx < 2
                          ? {
                              content: '""',
                              position: "absolute",
                              left: 8,
                              top: 36,
                              bottom: 8,
                              width: "2px",
                              bgcolor: "rgba(255, 255, 255, 0.08)",
                            }
                          : {},
                    }}
                  >
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        bgcolor: item.color,
                        mt: 0.5,
                        zIndex: 1,
                        boxShadow: `0 0 0 4px ${alpha(item.color, 0.2)}, 0 0 12px ${item.color}`,
                      }}
                    />
                    <Box flex={1}>
                      <Typography
                        variant="body2"
                        fontWeight="600"
                        mb={0.5}
                        sx={{ lineHeight: 1.4 }}
                      >
                        {item.title}
                      </Typography>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography
                          variant="caption"
                          color="rgba(255, 255, 255, 0.5)"
                        >
                          Due {item.time}
                        </Typography>
                        <Chip
                          label={item.priority}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            bgcolor: `${alpha(item.color, 0.15)}`,
                            color: item.color,
                            border: `1px solid ${alpha(item.color, 0.3)}`,
                          }}
                        />
                      </Stack>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Paper>

            {/* Connected Accounts */}
            <Paper
              elevation={0}
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
              <Typography variant="h3" fontWeight="700" mb={2}>
                Connected Accounts
              </Typography>
              <Stack spacing={1.5}>
                {stats.accounts?.map((account) => (
                  <Box
                    key={account.account_email}
                    sx={{
                      p: 2,
                      borderRadius: "16px",
                      bgcolor: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      transition: "all 0.3s ease",
                      "&:hover": {
                        bgcolor: "rgba(255, 255, 255, 0.06)",
                        borderColor: "rgba(255, 255, 255, 0.12)",
                        transform: "translateX(4px)",
                      },
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 40,
                        height: 40,
                        bgcolor: "rgba(59, 130, 246, 0.2)",
                        color: "#60A5FA",
                        fontSize: "1rem",
                        fontWeight: 700,
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                      }}
                    >
                      {account.account_email.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box flex={1} minWidth={0}>
                      <Typography variant="body2" fontWeight="600" noWrap>
                        {account.account_email}
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor: "#22C55E",
                            boxShadow: "0 0 8px rgba(34, 197, 94, 0.6)",
                          }}
                        />
                        <Typography
                          variant="caption"
                          color="rgba(255, 255, 255, 0.5)"
                        >
                          Active Sync
                        </Typography>
                      </Box>
                    </Box>
                    <IconButton
                      size="small"
                      sx={{
                        color: "rgba(255, 255, 255, 0.5)",
                        borderRadius: "10px",
                        "&:hover": {
                          bgcolor: "rgba(255, 255, 255, 0.08)",
                          color: "#fff",
                        },
                      }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;
