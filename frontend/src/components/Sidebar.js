import {
  Avatar,
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery
} from "@mui/material";

import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import AnalyticsRoundedIcon from "@mui/icons-material/AnalyticsRounded";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import InboxRoundedIcon from "@mui/icons-material/InboxRounded";
import LogoutIcon from "@mui/icons-material/Logout";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

const menuItems = [
  { text: "Dashboard", icon: <DashboardRoundedIcon />, path: "/" },
  { text: "Inbox", icon: <InboxRoundedIcon />, path: "/inbox", badge: "3" },
];

function Sidebar() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const drawer = (
    <Drawer
      variant={mobile ? "temporary" : "permanent"}
      open={mobile ? mobileOpen : true}
      onClose={handleDrawerToggle}
      sx={{
        width: { xs: 280, md: 280 },
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: { xs: 280, md: 260 },
          boxSizing: "border-box",
          bgcolor: "rgba(15, 20, 35, 0.6)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "24px",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
          margin: "16px",
          height: "calc(100% - 32px)",
          display: "flex",
          flexDirection: "column",
          backgroundImage: "none",
        },
      }}
    >
      {/* Logo Section */}
      <Toolbar sx={{ minHeight: "72px !important", px: 2.5, pt: 2 }}>
        {mobile && (
          <IconButton
            onClick={handleDrawerToggle}
            sx={{
              mr: 1,
              color: "rgba(255, 255, 255, 0.7)",
              borderRadius: "12px",
              "&:hover": { bgcolor: "rgba(255, 255, 255, 0.08)" },
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
        )}
        <Box display="flex" alignItems="center" gap={1.5}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "12px",
              background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
              boxShadow: "0 4px 16px rgba(59, 130, 246, 0.4)",
            }}
          >
            <AutoAwesomeIcon sx={{ color: "#fff", fontSize: 20 }} />
          </Box>
          <Typography
            variant="h6"
            fontWeight="800"
            sx={{
              letterSpacing: "-0.5px",
              background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            AI Assistant
          </Typography>
        </Box>
      </Toolbar>

      {/* Stats Overview */}
      <Box sx={{ px: 2.5, py: 2 }}>
        <Box
          sx={{
            p: 2,
            borderRadius: "16px",
            background: "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
          }}
        >
          <Box display="flex" alignItems="center" gap={1.5} mb={1.5}>
            <AnalyticsRoundedIcon sx={{ color: "#60A5FA", fontSize: 20 }} />
            <Typography variant="body2" fontWeight="700" color="#fff">
              Overview
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <MailOutlineRoundedIcon sx={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 18 }} />
            <Typography variant="body2" color="rgba(255, 255, 255, 0.7)">
              <Typography component="span" fontWeight="700" color="#fff" sx={{ fontSize: "1.1rem" }}>
                247
              </Typography>{" "}
              emails analyzed
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Menu Section */}
      <Box sx={{ px: 2, pt: 1, flexGrow: 1 }}>
        <Typography
          variant="caption"
          fontWeight="700"
          color="rgba(255, 255, 255, 0.5)"
          sx={{
            px: 2,
            mb: 1.5,
            display: "block",
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            fontSize: "0.65rem",
          }}
        >
          Menu
        </Typography>
        <List sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {menuItems.map((item) => {
            const selected = location.pathname === item.path;
            return (
              <ListItemButton
                key={item.text}
                component={Link}
                to={item.path}
                selected={selected}
                onClick={mobile ? handleDrawerToggle : undefined}
                sx={{
                  borderRadius: "16px",
                  py: 1.5,
                  px: 2,
                  transition: "all 0.3s ease",
                  color: selected ? "#fff" : "rgba(255, 255, 255, 0.6)",
                  background: selected
                    ? "linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.15) 100%)"
                    : "transparent",
                  border: selected ? "1px solid rgba(59, 130, 246, 0.4)" : "1px solid transparent",
                  position: "relative",
                  overflow: "hidden",
                  "&.Mui-selected": {
                    background: "linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.15) 100%)",
                    border: "1px solid rgba(59, 130, 246, 0.4)",
                    "&:hover": {
                      background: "linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(59, 130, 246, 0.2) 100%)",
                    },
                  },
                  "&:hover": {
                    background: selected
                      ? "linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(59, 130, 246, 0.2) 100%)"
                      : "rgba(255, 255, 255, 0.05)",
                    color: "#fff",
                    transform: "translateX(4px)",
                    borderColor: selected ? "rgba(59, 130, 246, 0.5)" : "rgba(255, 255, 255, 0.1)",
                  },
                  "&::before": selected
                    ? {
                        content: '""',
                        position: "absolute",
                        left: 0,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 3,
                        height: "60%",
                        bgcolor: "#3B82F6",
                        borderRadius: "0 4px 4px 0",
                        boxShadow: "0 0 12px rgba(59, 130, 246, 0.6)",
                      }
                    : {},
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 36,
                    color: selected ? "#60A5FA" : "inherit",
                    transition: "all 0.3s ease",
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontWeight: selected ? 700 : 600,
                    fontSize: "0.95rem",
                  }}
                />
                {item.badge && (
                  <Chip
                    label={item.badge}
                    size="small"
                    sx={{
                      height: 22,
                      minWidth: 24,
                      bgcolor: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
                      color: "#fff",
                      fontSize: "0.7rem",
                      fontWeight: "700",
                      boxShadow: "0 2px 8px rgba(59, 130, 246, 0.4)",
                    }}
                  />
                )}
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      {/* Bottom Section */}
      <Box sx={{ p: 2 }}>
        <Typography
          variant="caption"
          fontWeight="700"
          color="rgba(255, 255, 255, 0.5)"
          sx={{
            px: 2,
            mb: 1.5,
            display: "block",
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            fontSize: "0.65rem",
          }}
        >
          General
        </Typography>
        <List sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 2 }}>
          <ListItemButton
            component={Link}
            to="/settings"
            selected={location.pathname === "/settings"}
            onClick={mobile ? handleDrawerToggle : undefined}
            sx={{
              borderRadius: "16px",
              py: 1.5,
              px: 2,
              transition: "all 0.3s ease",
              color: location.pathname === "/settings" ? "#fff" : "rgba(255, 255, 255, 0.6)",
              background:
                location.pathname === "/settings"
                  ? "linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.15) 100%)"
                  : "transparent",
              border:
                location.pathname === "/settings"
                  ? "1px solid rgba(59, 130, 246, 0.4)"
                  : "1px solid transparent",
              "&.Mui-selected": {
                background: "linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.15) 100%)",
              },
              "&:hover": {
                background: "rgba(255, 255, 255, 0.05)",
                color: "#fff",
                transform: "translateX(4px)",
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 36,
                color: location.pathname === "/settings" ? "#60A5FA" : "inherit",
              }}
            >
              <SettingsRoundedIcon />
            </ListItemIcon>
            <ListItemText
              primary="Settings"
              primaryTypographyProps={{ fontWeight: 600, fontSize: "0.95rem" }}
            />
          </ListItemButton>
        </List>

        {/* User Profile Card */}
        <Box
          sx={{
            p: 2,
            borderRadius: "20px",
            background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            gap: 2,
            transition: "all 0.3s ease",
            "&:hover": {
              background: "rgba(255, 255, 255, 0.08)",
              borderColor: "rgba(255, 255, 255, 0.12)",
            },
          }}
        >
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: "transparent",
              background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
              fontSize: "1rem",
              fontWeight: 700,
              border: "2px solid rgba(255, 255, 255, 0.2)",
            }}
          >
            A
          </Avatar>
          <Box flex={1} minWidth={0}>
            <Typography variant="body2" fontWeight="700" noWrap>
              Abhiram
            </Typography>
            <Typography variant="caption" color="rgba(255, 255, 255, 0.5)" noWrap>
              Premium Plan
            </Typography>
          </Box>
          <IconButton
            size="small"
            sx={{
              color: "rgba(255, 255, 255, 0.5)",
              borderRadius: "12px",
              "&:hover": {
                color: "#F87171",
                bgcolor: "rgba(239, 68, 68, 0.15)",
              },
            }}
            onClick={() => localStorage.clear()}
          >
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Drawer>
  );

  return drawer;
}

export default Sidebar;
