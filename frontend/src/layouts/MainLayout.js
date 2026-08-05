import { Outlet } from "react-router-dom";

import { Box, Toolbar } from "@mui/material";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import FloatingChat from "../components/FloatingChat";

function MainLayout({ logout, darkMode, toggleDarkMode }) {
  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "transparent",
        position: "relative",
      }}
    >
      {/* Background Gradient Overlay */}
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(ellipse at 15% 15%, rgba(91, 140, 255, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 85% 85%, rgba(139, 92, 246, 0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(0, 212, 255, 0.04) 0%, transparent 60%)
          `,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: "hidden",
          position: "relative",
          zIndex: 1,
          ml: 0,
        }}
      >
        {/* Floating Navbar */}
        <Navbar logout={logout} darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
        
        <Toolbar />

        {/* Content Area */}
        <Box
          sx={{
            p: { xs: 1, sm: 2, md: 2 },
            overflow: "auto",
            width: "100%",
            minHeight: "calc(100vh - 120px)",
          }}
        >
          <Outlet />
        </Box>
      </Box>

      {/* Floating Chat Button */}
      <FloatingChat />
    </Box>
  );
}

export default MainLayout;
