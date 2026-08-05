import { useEffect, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import { toast } from "react-toastify";

import {
  Box,
  Paper,
  Typography,
  TextField,
  Switch,
  Button,
  Stack,
  MenuItem,
  Divider,
  List,
  ListItem,
  ListItemText,
  Grid,
  Avatar,
} from "@mui/material";

import PersonIcon from "@mui/icons-material/Person";
import NotificationsIcon from "@mui/icons-material/Notifications";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import SaveIcon from "@mui/icons-material/Save";
import EmailIcon from "@mui/icons-material/Email";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

function Settings() {
  const [settings, setSettings] = useState({
    user_name: "",
    theme: "dark",
  });

  const [accounts, setAccounts] = useState([]);
  const [desktopNotification, setDesktopNotification] = useState(
    localStorage.getItem("desktopNotification") === "true"
  );
  const [emailNotification, setEmailNotification] = useState(
    localStorage.getItem("emailNotification") === "true"
  );

  useEffect(() => {
    axios.get("http://127.0.0.1:5000/settings").then((res) => setSettings(res.data));

    loadAccounts();
  }, []);

  const loadAccounts = () => {
    axios.get("http://127.0.0.1:5000/gmail/accounts").then((res) => setAccounts(res.data));
  };

  const save = () => {
    localStorage.setItem("desktopNotification", desktopNotification);
    localStorage.setItem("emailNotification", emailNotification);

    axios.post("http://127.0.0.1:5000/settings", settings).then(() => {
      toast.success("Settings saved successfully!");
    });
  };

  const addAccount = () => {
    axios
      .post("http://127.0.0.1:5000/gmail/add")
      .then(() => {
        toast.success("Gmail account added");
        loadAccounts();
      })
      .catch((err) => {
        toast.error("Failed to add Gmail account");
        console.error(err);
      });
  };

  const removeAccount = (id) => {
    axios
      .delete(`http://127.0.0.1:5000/gmail/remove/${id}`)
      .then(() => {
        toast.success("Gmail account removed");
        loadAccounts();
      })
      .catch((err) => {
        toast.error("Failed to remove Gmail account");
        console.error(err);
      });
  };

  const downloadExcel = async () => {
    try {
      const response = await axios.get("http://127.0.0.1:5000/export/excel", {
        responseType: "blob",
      });
      saveAs(response.data, "emails.xlsx");
      toast.success("Excel exported successfully");
    } catch (err) {
      toast.error("Failed to export Excel");
      console.error(err);
    }
  };

  const downloadPDF = async () => {
    try {
      const response = await axios.get("http://127.0.0.1:5000/export/pdf", {
        responseType: "blob",
      });
      saveAs(response.data, "emails.pdf");
      toast.success("PDF exported successfully");
    } catch (err) {
      toast.error("Failed to export PDF");
      console.error(err);
    }
  };

  const GlassSection = ({ icon, title, children }) => (
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
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "12px",
            background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(59, 130, 246, 0.4)",
          }}
        >
          {icon}
        </Box>
        <Typography variant="h4" fontWeight="700">
          {title}
        </Typography>
      </Box>
      <Divider sx={{ mb: 3, borderColor: "rgba(255, 255, 255, 0.08)" }} />
      {children}
    </Paper>
  );

  return (
    <Box sx={{ maxWidth: "1200px", mx: "auto", p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box mb={4}>
        <Typography
          variant="h1"
          fontWeight="800"
          sx={{ letterSpacing: "-1px", fontSize: "2rem" }}
        >
          Settings
        </Typography>
        <Typography color="rgba(255, 255, 255, 0.6)" variant="body1" mt={1}>
          Manage your account preferences and configurations
        </Typography>
      </Box>

      <Stack spacing={3}>
        {/* Profile Section */}
        <GlassSection
          icon={<PersonIcon sx={{ color: "#fff", fontSize: 22 }} />}
          title="Profile"
        >
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Dashboard Name"
                value={settings.user_name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    user_name: e.target.value,
                  })
                }
                sx={{
                  "& .MuiInputLabel-root": {
                    color: "rgba(255, 255, 255, 0.5)",
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select
                fullWidth
                label="Theme"
                value={settings.theme}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    theme: e.target.value,
                  })
                }
                sx={{
                  "& .MuiInputLabel-root": {
                    color: "rgba(255, 255, 255, 0.5)",
                  },
                }}
              >
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="dark">Dark</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </GlassSection>

        {/* Connected Accounts */}
        <GlassSection
          icon={<EmailIcon sx={{ color: "#fff", fontSize: 22 }} />}
          title="Connected Gmail Accounts"
        >
          {accounts.length > 0 ? (
            <List disablePadding>
              {accounts.map((account, idx) => (
                <Box key={account.id}>
                  <ListItem
                    sx={{
                      px: 0,
                      py: 2,
                      alignItems: "center",
                    }}
                    secondaryAction={
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => removeAccount(account.id)}
                        sx={{
                          borderRadius: "12px",
                          px: 2,
                          fontWeight: 600,
                          bgcolor: "rgba(239, 68, 68, 0.05)",
                          borderColor: "rgba(239, 68, 68, 0.3)",
                          color: "#F87171",
                          "&:hover": {
                            bgcolor: "rgba(239, 68, 68, 0.15)",
                            borderColor: "#EF4444",
                          },
                        }}
                      >
                        Remove
                      </Button>
                    }
                  >
                    <Avatar
                      sx={{
                        width: 48,
                        height: 48,
                        bgcolor: "rgba(59, 130, 246, 0.2)",
                        color: "#60A5FA",
                        mr: 2,
                        fontWeight: 700,
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                      }}
                    >
                      {account.email.charAt(0).toUpperCase()}
                    </Avatar>
                    <ListItemText
                      primary={
                        <Typography fontWeight="600" fontSize="1rem">
                          {account.email}
                        </Typography>
                      }
                      secondary={
                        <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                          <CheckCircleIcon
                            sx={{ fontSize: 16, color: "#22C55E" }}
                          />
                          <Typography variant="body2" color="rgba(255, 255, 255, 0.5)">
                            Connected • {account.total_emails || 0} Emails
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                  {idx < accounts.length - 1 && (
                    <Divider sx={{ my: 1, borderColor: "rgba(255, 255, 255, 0.08)" }} />
                  )}
                </Box>
              ))}
            </List>
          ) : (
            <Box
              sx={{
                p: 4,
                textAlign: "center",
                borderRadius: "16px",
                bgcolor: "rgba(255, 255, 255, 0.03)",
                border: "1px dashed rgba(255, 255, 255, 0.1)",
              }}
            >
              <EmailIcon sx={{ fontSize: 48, color: "rgba(255, 255, 255, 0.3)", mb: 1 }} />
              <Typography variant="body2" color="rgba(255, 255, 255, 0.5)">
                No accounts connected yet
              </Typography>
            </Box>
          )}

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addAccount}
            sx={{
              mt: 3,
              borderRadius: "16px",
              px: 4,
              py: 1.5,
              fontWeight: 600,
              background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
              boxShadow: "0 4px 20px rgba(59, 130, 246, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              "&:hover": {
                background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                boxShadow: "0 8px 30px rgba(59, 130, 246, 0.6)",
              },
            }}
          >
            Add Gmail Account
          </Button>
        </GlassSection>

        {/* Notifications */}
        <GlassSection
          icon={<NotificationsIcon sx={{ color: "#fff", fontSize: 22 }} />}
          title="Notifications"
        >
          <Stack spacing={2}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: "16px",
                bgcolor: "rgba(15, 20, 35, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "all 0.3s ease",
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  borderColor: "rgba(255, 255, 255, 0.12)",
                },
              }}
            >
              <Box>
                <Typography fontWeight="600" mb={0.5}>
                  Desktop Notifications
                </Typography>
                <Typography variant="body2" color="rgba(255, 255, 255, 0.5)">
                  Receive real-time alerts on your desktop
                </Typography>
              </Box>
              <Switch
                checked={desktopNotification}
                onChange={(e) => setDesktopNotification(e.target.checked)}
              />
            </Box>

            <Box
              sx={{
                p: 2.5,
                borderRadius: "16px",
                bgcolor: "rgba(15, 20, 35, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "all 0.3s ease",
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  borderColor: "rgba(255, 255, 255, 0.12)",
                },
              }}
            >
              <Box>
                <Typography fontWeight="600" mb={0.5}>
                  Email Alerts
                </Typography>
                <Typography variant="body2" color="rgba(255, 255, 255, 0.5)">
                  Get notified via email for important updates
                </Typography>
              </Box>
              <Switch
                checked={emailNotification}
                onChange={(e) => setEmailNotification(e.target.checked)}
              />
            </Box>
          </Stack>
        </GlassSection>

        {/* Export Data */}
        <GlassSection
          icon={<CloudDownloadIcon sx={{ color: "#fff", fontSize: 22 }} />}
          title="Export Data"
        >
          <Typography variant="body2" color="rgba(255, 255, 255, 0.6)" mb={3}>
            Download your email data in various formats for backup or analysis
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<CloudDownloadIcon />}
              onClick={downloadPDF}
              sx={{
                borderRadius: "16px",
                px: 3,
                py: 1.5,
                fontWeight: 600,
                bgcolor: "rgba(239, 68, 68, 0.05)",
                borderColor: "rgba(239, 68, 68, 0.3)",
                color: "#F87171",
                "&:hover": {
                  bgcolor: "rgba(239, 68, 68, 0.15)",
                  borderColor: "#EF4444",
                },
              }}
            >
              Export PDF
            </Button>
            <Button
              variant="outlined"
              startIcon={<CloudDownloadIcon />}
              onClick={downloadExcel}
              sx={{
                borderRadius: "16px",
                px: 3,
                py: 1.5,
                fontWeight: 600,
                bgcolor: "rgba(34, 197, 94, 0.05)",
                borderColor: "rgba(34, 197, 94, 0.3)",
                color: "#4ADE80",
                "&:hover": {
                  bgcolor: "rgba(34, 197, 94, 0.15)",
                  borderColor: "#22C55E",
                },
              }}
            >
              Export Excel
            </Button>
          </Stack>
        </GlassSection>

        {/* Save Button */}
        <Box display="flex" justifyContent="flex-end" pt={2}>
          <Button
            variant="contained"
            size="large"
            startIcon={<SaveIcon />}
            onClick={save}
            sx={{
              borderRadius: "16px",
              px: 5,
              py: 1.5,
              fontWeight: 600,
              fontSize: "1rem",
              background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
              boxShadow: "0 4px 20px rgba(34, 197, 94, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              "&:hover": {
                background: "linear-gradient(135deg, #16A34A 0%, #15803D 100%)",
                boxShadow: "0 8px 30px rgba(34, 197, 94, 0.6)",
              },
            }}
          >
            Save Settings
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

export default Settings;
