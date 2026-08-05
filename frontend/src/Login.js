import { useState } from "react";

import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Divider,
} from "@mui/material";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    localStorage.setItem("loggedIn", "true");
    onLogin();
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0B1120 0%, #172554 50%, #111827 100%)",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.2) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(34, 197, 94, 0.1) 0%, transparent 60%)
          `,
          pointerEvents: "none",
        },
      }}
    >
      <Paper
        component="form"
        onSubmit={handleSubmit}
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 440,
          mx: 2,
          p: 5,
          background: "rgba(20, 25, 45, 0.55)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "28px",
          boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo & Header */}
        <Box textAlign="center" mb={4}>
          <Box
            sx={{
              width: 72,
              height: 72,
              mx: "auto",
              mb: 2,
              borderRadius: "20px",
              background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 32px rgba(59, 130, 246, 0.5)",
              border: "2px solid rgba(255, 255, 255, 0.2)",
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 40, color: "#fff" }} />
          </Box>
          <Typography
            variant="h3"
            fontWeight="800"
            sx={{
              letterSpacing: "-0.5px",
              background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              mb: 1,
            }}
          >
            Welcome Back
          </Typography>
          <Typography variant="body1" color="rgba(255, 255, 255, 0.6)">
            Sign in to your AI Email Assistant
          </Typography>
        </Box>

        <Stack spacing={3}>
          {/* Email Input */}
          <TextField
            fullWidth
            type="email"
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            InputProps={{
              startAdornment: (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mr: 1.5,
                    color: "rgba(255, 255, 255, 0.4)",
                  }}
                >
                  <EmailIcon fontSize="small" />
                </Box>
              ),
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
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
              "& .MuiInputLabel-root": {
                color: "rgba(255, 255, 255, 0.5)",
                "&.Mui-focused": {
                  color: "#3B82F6",
                },
              },
              "& .MuiInputBase-input": {
                color: "#fff",
              },
            }}
          />

          {/* Password Input */}
          <TextField
            fullWidth
            type="password"
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{
              startAdornment: (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mr: 1.5,
                    color: "rgba(255, 255, 255, 0.4)",
                  }}
                >
                  <LockIcon fontSize="small" />
                </Box>
              ),
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
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
              "& .MuiInputLabel-root": {
                color: "rgba(255, 255, 255, 0.5)",
                "&.Mui-focused": {
                  color: "#3B82F6",
                },
              },
              "& .MuiInputBase-input": {
                color: "#fff",
              },
            }}
          />

          {/* Remember Me & Forgot Password */}
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography
              variant="body2"
              sx={{
                color: "rgba(255, 255, 255, 0.5)",
                cursor: "pointer",
                transition: "color 0.2s",
                "&:hover": {
                  color: "#3B82F6",
                },
              }}
            >
              Remember me
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "#60A5FA",
                cursor: "pointer",
                fontWeight: 600,
                transition: "color 0.2s",
                "&:hover": {
                  color: "#3B82F6",
                },
              }}
            >
              Forgot password?
            </Typography>
          </Box>

          {/* Login Button */}
          <Button
            type="submit"
            fullWidth
            size="large"
            endIcon={<ArrowForwardIcon />}
            sx={{
              mt: 2,
              py: 1.75,
              borderRadius: "16px",
              fontWeight: 700,
              fontSize: "1rem",
              textTransform: "none",
              background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
              boxShadow: "0 6px 24px rgba(59, 130, 246, 0.5)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              transition: "all 0.3s ease",
              "&:hover": {
                background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                boxShadow: "0 10px 36px rgba(59, 130, 246, 0.7)",
                transform: "translateY(-2px)",
              },
              "&:active": {
                transform: "translateY(0)",
              },
            }}
          >
            Sign In
          </Button>

          {/* Divider */}
          <Box sx={{ position: "relative", my: 3 }}>
            <Divider sx={{ borderColor: "rgba(255, 255, 255, 0.1)" }} />
            <Typography
              sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                bgcolor: "rgba(17, 24, 39, 1)",
                px: 2,
                color: "rgba(255, 255, 255, 0.4)",
                fontSize: "0.85rem",
              }}
            >
              or continue with
            </Typography>
          </Box>

          {/* Google Login */}
          <Button
            fullWidth
            variant="outlined"
            sx={{
              py: 1.5,
              borderRadius: "16px",
              fontWeight: 600,
              fontSize: "0.95rem",
              textTransform: "none",
              bgcolor: "rgba(255, 255, 255, 0.05)",
              borderColor: "rgba(255, 255, 255, 0.15)",
              color: "#fff",
              transition: "all 0.3s ease",
              "&:hover": {
                bgcolor: "rgba(255, 255, 255, 0.1)",
                borderColor: "rgba(255, 255, 255, 0.25)",
              },
            }}
          >
            <Box
              component="img"
              src="https://www.google.com/favicon.ico"
              alt="Google"
              sx={{ width: 20, height: 20, mr: 1.5 }}
            />
            Continue with Google
          </Button>

          {/* Sign Up Link */}
          <Typography
            variant="body2"
            textAlign="center"
            sx={{ color: "rgba(255, 255, 255, 0.5)", mt: 2 }}
          >
            Don't have an account?{" "}
            <Typography
              component="span"
              sx={{
                color: "#60A5FA",
                fontWeight: 600,
                cursor: "pointer",
                transition: "color 0.2s",
                "&:hover": {
                  color: "#3B82F6",
                },
              }}
            >
              Create Account
            </Typography>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

export default Login;
