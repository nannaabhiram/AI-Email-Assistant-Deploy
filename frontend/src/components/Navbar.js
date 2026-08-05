import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Chip,
  Divider,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material";

import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import InboxRoundedIcon from "@mui/icons-material/InboxRounded";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import SyncIcon from "@mui/icons-material/Sync";

function Navbar({ logout, toggleDarkMode }) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const location = useLocation();
  
  const [profileAnchor, setProfileAnchor] = useState(null);
  const [notifAnchor, setNotifAnchor] = useState(null);

  const closeProfile = () => {
    setProfileAnchor(null);
  };

  const navItems = [
    { text: "Dashboard", icon: <DashboardRoundedIcon />, path: "/" },
    { text: "Inbox", icon: <InboxRoundedIcon />, path: "/inbox" },
  ];

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "rgba(15, 20, 35, 0.55)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "24px",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
          color: "text.primary",
          zIndex: theme.zIndex.drawer + 1,
          margin: "16px",
          width: "calc(100% - 32px)",
        }}
      >
        <Toolbar sx={{ minHeight: "72px !important", px: { xs: 2, md: 4 } }}>
          {/* Logo */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: "12px",
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
                boxShadow: "0 4px 16px rgba(59, 130, 246, 0.4)",
              }}
            >
              <AutoAwesomeIcon sx={{ color: "#fff", fontSize: 22 }} />
            </Box>
            <Typography
              variant="h6"
              fontWeight="800"
              sx={{
                letterSpacing: "-0.5px",
                fontSize: "1.25rem",
                background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              AI Assistant
            </Typography>
          </Box>

          {/* Center Navigation */}
          {!mobile && (
            <Box
              sx={{
                display: "flex",
                gap: 1,
                ml: 4,
                bgcolor: "rgba(255, 255, 255, 0.03)",
                borderRadius: "16px",
                padding: "4px",
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Box
                    key={item.text}
                    component={Link}
                    to={item.path}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 2.5,
                      py: 1,
                      borderRadius: "12px",
                      color: isActive ? "#fff" : "rgba(255, 255, 255, 0.6)",
                      bgcolor: isActive ? "rgba(59, 130, 246, 0.2)" : "transparent",
                      border: isActive ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid transparent",
                      transition: "all 0.3s ease",
                      textDecoration: "none",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      "&:hover": {
                        bgcolor: "rgba(59, 130, 246, 0.15)",
                        color: "#fff",
                        transform: "translateY(-1px)",
                      },
                    }}
                  >
                    {item.icon}
                    <Typography variant="body2" fontWeight={600}>
                      {item.text}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}

          <Box sx={{ flexGrow: 1 }} />

          {/* Right Section */}
          <Box sx={{ display: "flex", gap: { xs: 1, md: 1.5 }, alignItems: "center" }}>
            {/* Search Bar (Desktop) */}
            {!mobile && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "16px",
                  px: 2,
                  py: 0.75,
                  width: 280,
                  transition: "all 0.3s ease",
                  "&:focus-within": {
                    borderColor: "#3B82F6",
                    bgcolor: "rgba(59, 130, 246, 0.08)",
                    boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.2)",
                  },
                }}
              >
                <SearchIcon sx={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 20, mr: 1.5 }} />
                <InputBase
                  placeholder="Search emails..."
                  sx={{
                    color: "#FFFFFF",
                    fontSize: "0.9rem",
                    width: "100%",
                    "&::placeholder": {
                      color: "rgba(255, 255, 255, 0.4)",
                    },
                  }}
                />
                <Box
                  sx={{
                    bgcolor: "rgba(255, 255, 255, 0.1)",
                    color: "rgba(255, 255, 255, 0.6)",
                    fontSize: "0.7rem",
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    fontWeight: 600,
                  }}
                >
                  ⌘K
                </Box>
              </Box>
            )}

            {/* Sync Status */}
            {!mobile && (
              <Chip
                icon={<SyncIcon sx={{ fontSize: 16 }} />}
                label="Synced"
                size="small"
                sx={{
                  color: "rgba(255, 255, 255, 0.7)",
                  bgcolor: "rgba(34, 197, 94, 0.1)",
                  border: "1px solid rgba(34, 197, 94, 0.2)",
                  borderRadius: "12px",
                  height: 32,
                  fontWeight: 600,
                  "& .MuiChip-icon": { color: "#22C55E" },
                }}
              />
            )}

            {/* Theme Toggle */}
            <Tooltip title="Toggle Theme" arrow>
              <IconButton
                onClick={toggleDarkMode}
                sx={{
                  color: "rgba(255, 255, 255, 0.7)",
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  padding: 1,
                  transition: "all 0.3s ease",
                  "&:hover": {
                    color: "#3B82F6",
                    bgcolor: "rgba(59, 130, 246, 0.15)",
                    transform: "scale(1.05)",
                    borderColor: "rgba(59, 130, 246, 0.3)",
                  },
                }}
              >
                <DarkModeOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Notifications */}
            <Tooltip title="Notifications" arrow>
              <IconButton
                onClick={(e) => setNotifAnchor(e.currentTarget)}
                sx={{
                  color: "rgba(255, 255, 255, 0.7)",
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  padding: 1,
                  transition: "all 0.3s ease",
                  "&:hover": {
                    color: "#3B82F6",
                    bgcolor: "rgba(59, 130, 246, 0.15)",
                    transform: "scale(1.05)",
                  },
                }}
              >
                <Badge badgeContent={3} color="error" sx={{ "& .MuiBadge-badge": { fontWeight: 700, fontSize: "0.65rem" } }}>
                  <NotificationsNoneIcon fontSize="small" />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* Mobile Menu */}
            {mobile && (
              <IconButton color="inherit" sx={{ borderRadius: "12px" }}>
                <MenuIcon />
              </IconButton>
            )}

            {/* Divider */}
            {!mobile && (
              <Box
                sx={{
                  width: 1,
                  height: 24,
                  bgcolor: "rgba(255, 255, 255, 0.1)",
                  mx: 1,
                }}
              />
            )}

            {/* Profile Avatar */}
            <Avatar
              onClick={(event) => setProfileAnchor(event.currentTarget)}
              sx={{
                bgcolor: "transparent",
                background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
                cursor: "pointer",
                width: 40,
                height: 40,
                fontWeight: 700,
                fontSize: "1rem",
                border: "2px solid rgba(255, 255, 255, 0.2)",
                boxShadow: "0 4px 16px rgba(59, 130, 246, 0.4)",
                transition: "all 0.3s ease",
                "&:hover": {
                  transform: "scale(1.08)",
                  boxShadow: "0 6px 20px rgba(59, 130, 246, 0.6)",
                },
              }}
            >
              A
            </Avatar>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Profile Menu */}
      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={closeProfile}
        PaperProps={{
          sx: {
            mt: 1.5,
            minWidth: 240,
            borderRadius: "20px",
            bgcolor: "rgba(17, 24, 39, 0.95)",
            backdropFilter: "blur(22px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5)",
            p: 1.5,
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 2,
            mb: 1,
            bgcolor: "rgba(59, 130, 246, 0.1)",
            borderRadius: "16px",
            border: "1px solid rgba(59, 130, 246, 0.2)",
          }}
        >
          <Typography variant="subtitle2" fontWeight="700" color="#fff">
            Abhiram
          </Typography>
          <Typography variant="caption" color="rgba(255, 255, 255, 0.6)">
            abhiram@email.com
          </Typography>
        </Box>
        <MenuItem
          component={Link}
          to="/settings"
          onClick={closeProfile}
          sx={{
            gap: 2,
            py: 1.5,
            borderRadius: "12px",
            mb: 0.5,
            transition: "all 0.2s ease",
            "&:hover": {
              bgcolor: "rgba(59, 130, 246, 0.15)",
              transform: "translateX(4px)",
            },
          }}
        >
          <SettingsIcon fontSize="small" sx={{ color: "#60A5FA" }} />
          <Typography fontWeight={600}>Settings</Typography>
        </MenuItem>
        <Divider sx={{ my: 1, borderColor: "rgba(255, 255, 255, 0.08)" }} />
        <MenuItem
          onClick={() => {
            closeProfile();
            logout();
          }}
          sx={{
            gap: 2,
            py: 1.5,
            borderRadius: "12px",
            color: "#F87171",
            transition: "all 0.2s ease",
            "&:hover": {
              bgcolor: "rgba(239, 68, 68, 0.15)",
              transform: "translateX(4px)",
            },
          }}
        >
          <LogoutIcon fontSize="small" />
          <Typography fontWeight={600}>Log out</Typography>
        </MenuItem>
      </Menu>

      {/* Notifications Menu */}
      <Menu
        anchorEl={notifAnchor}
        open={Boolean(notifAnchor)}
        onClose={() => setNotifAnchor(null)}
        PaperProps={{
          sx: {
            mt: 1.5,
            minWidth: 320,
            borderRadius: "20px",
            bgcolor: "rgba(17, 24, 39, 0.95)",
            backdropFilter: "blur(22px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5)",
            p: 1.5,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5, mb: 1 }}>
          <Typography variant="h6" fontWeight="700">
            Notifications
          </Typography>
        </Box>
        {[
          { title: "New Google Internship", time: "2 mins ago", color: "#3B82F6" },
          { title: "Adobe Interview Prep", time: "1 hour ago", color: "#8B5CF6" },
          { title: "Sync Completed", time: "3 hours ago", color: "#22C55E" },
        ].map((notif, idx) => (
          <MenuItem
            key={idx}
            onClick={() => setNotifAnchor(null)}
            sx={{
              gap: 2,
              py: 1.5,
              borderRadius: "12px",
              mb: 0.5,
              transition: "all 0.2s ease",
              "&:hover": {
                bgcolor: "rgba(255, 255, 255, 0.05)",
                transform: "translateX(4px)",
              },
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: notif.color,
                boxShadow: `0 0 8px ${notif.color}`,
              }}
            />
            <Box flex={1}>
              <Typography variant="body2" fontWeight={600}>
                {notif.title}
              </Typography>
              <Typography variant="caption" color="rgba(255, 255, 255, 0.5)">
                {notif.time}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export default Navbar;
