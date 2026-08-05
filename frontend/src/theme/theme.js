import { createTheme } from "@mui/material/styles";

export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#5B8CFF",
      light: "#7BA3FF",
      dark: "#3B6BE0",
    },
    secondary: {
      main: "#8B5CF6",
      light: "#A78BFA",
      dark: "#6D28D9",
    },
    success: {
      main: "#00D68F",
      light: "#00E9A1",
      dark: "#00B377",
    },
    warning: {
      main: "#FFB020",
      light: "#FFC247",
      dark: "#E09800",
    },
    error: {
      main: "#FF5C5C",
      light: "#FF7B7B",
      dark: "#E03C3C",
    },
    background: {
      default: "#060816",
      paper: "rgba(20, 25, 45, 0.55)",
    },
    text: {
      primary: "#FFFFFF",
      secondary: "#B8C2E5",
      disabled: "#7E8AAE",
    },
    divider: "rgba(255, 255, 255, 0.08)",
    action: {
      hover: "rgba(255, 255, 255, 0.04)",
      selected: "rgba(91, 140, 255, 0.1)",
      disabled: "rgba(255, 255, 255, 0.3)",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "'Inter', 'Poppins', 'Roboto', 'Helvetica', 'Arial', sans-serif",
    h1: {
      fontSize: '2.25rem',
      fontWeight: 800,
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
      color: '#FFFFFF',
    },
    h2: {
      fontSize: '1.875rem',
      fontWeight: 700,
      letterSpacing: '-0.01em',
      lineHeight: 1.3,
      color: '#FFFFFF',
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 700,
      letterSpacing: '-0.01em',
      lineHeight: 1.4,
      color: '#FFFFFF',
    },
    h4: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.4,
      color: '#FFFFFF',
    },
    h5: {
      fontSize: '1.1rem',
      fontWeight: 600,
      lineHeight: 1.5,
      color: '#FFFFFF',
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.5,
      color: '#FFFFFF',
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.7,
      color: '#B8C2E5',
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.6,
      color: '#B8C2E5',
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
      fontSize: '0.9rem',
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 500,
      color: '#7E8AAE',
    },
    overline: {
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: '#7E8AAE',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Poppins:wght@400;500;600;700;800&display=swap');
        
        body {
          background: #060816;
          color: #FFFFFF;
          font-family: 'Inter', sans-serif;
        }
        
        * {
          scrollbar-width: thin;
          scrollbar-color: rgba(91, 140, 255, 0.3) transparent;
        }
        
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        
        ::-webkit-scrollbar-thumb {
          background: rgba(91, 140, 255, 0.3);
          border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(91, 140, 255, 0.5);
        }
      `,
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(15, 20, 35, 0.55)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "24px",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
          backgroundImage: "none",
          margin: "16px",
          width: "calc(100% - 32px)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "rgba(15, 20, 35, 0.6)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "24px",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
          backgroundImage: "none",
          margin: "16px",
          height: "calc(100% - 32px)",
          width: "calc(280px - 32px)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(20, 25, 45, 0.55)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
          borderRadius: "20px",
          transition: "all 0.3s ease",
          "&:hover": {
            transform: "translateY(-2px)",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(91, 140, 255, 0.1)",
            borderColor: "rgba(91, 140, 255, 0.15)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(20, 25, 45, 0.55)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
          backgroundImage: "none",
          borderRadius: "20px",
          transition: "all 0.3s ease",
          "&:hover": {
            transform: "translateY(-2px)",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(91, 140, 255, 0.1)",
            borderColor: "rgba(91, 140, 255, 0.15)",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: "14px",
          padding: "12px 28px",
          transition: "all 0.3s ease",
          fontWeight: 600,
          textTransform: "none",
          minHeight: "48px",
          fontSize: "0.9rem",
        },
        containedPrimary: {
          background: "linear-gradient(135deg, #5B8CFF 0%, #3B6BE0 100%)",
          boxShadow: "0 4px 16px rgba(91, 140, 255, 0.25)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          "&:hover": {
            boxShadow: "0 6px 24px rgba(91, 140, 255, 0.35), 0 0 30px rgba(91, 140, 255, 0.2)",
            transform: "translateY(-2px)",
            background: "linear-gradient(135deg, #4A7BEE 0%, #2A5AD0 100%)",
          },
          "&:active": {
            transform: "translateY(0)",
          },
        },
        containedSecondary: {
          background: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
          boxShadow: "0 4px 16px rgba(139, 92, 246, 0.25)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          "&:hover": {
            boxShadow: "0 6px 24px rgba(139, 92, 246, 0.35), 0 0 30px rgba(139, 92, 246, 0.2)",
            transform: "translateY(-2px)",
          },
        },
        outlined: {
          borderColor: "rgba(255, 255, 255, 0.1)",
          color: "#B8C2E5",
          background: "rgba(15, 20, 35, 0.3)",
          "&:hover": {
            backgroundColor: "rgba(91, 140, 255, 0.08)",
            borderColor: "rgba(91, 140, 255, 0.3)",
            transform: "translateY(-2px)",
          },
        },
        outlinedPrimary: {
          borderColor: "rgba(91, 140, 255, 0.3)",
          color: "#7BA3FF",
          "&:hover": {
            backgroundColor: "rgba(91, 140, 255, 0.08)",
            borderColor: "#5B8CFF",
            transform: "translateY(-2px)",
          },
        },
        text: {
          color: "#B8C2E5",
          "&:hover": {
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            color: "#FFFFFF",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: "rgba(15, 20, 35, 0.5)",
            backdropFilter: "blur(12px)",
            borderRadius: "14px",
            transition: "all 0.3s ease",
            "& fieldset": {
              borderColor: "rgba(255, 255, 255, 0.08)",
              transition: "all 0.3s ease",
            },
            "&:hover fieldset": {
              borderColor: "rgba(91, 140, 255, 0.2)",
            },
            "&.Mui-focused fieldset": {
              borderColor: "#5B8CFF",
              borderWidth: "2px",
            },
            "&.Mui-focused": {
              backgroundColor: "rgba(15, 20, 35, 0.6)",
              boxShadow: "0 0 0 3px rgba(91, 140, 255, 0.1), 0 0 20px rgba(91, 140, 255, 0.15)",
            },
          },
          "& .MuiInputLabel-root": {
            color: "#7E8AAE",
            "&.Mui-focused": {
              color: "#5B8CFF",
            },
          },
          "& .MuiInputBase-input": {
            color: "#FFFFFF",
            "&::placeholder": {
              color: "#7E8AAE",
              opacity: 1,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(20, 25, 45, 0.5)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "10px",
          fontWeight: 600,
          transition: "all 0.25s ease",
          "&:hover": {
            backgroundColor: "rgba(30, 35, 55, 0.6)",
          },
        },
        colorPrimary: {
          backgroundColor: "rgba(91, 140, 255, 0.15)",
          color: "#7BA3FF",
          borderColor: "rgba(91, 140, 255, 0.2)",
        },
        colorSuccess: {
          backgroundColor: "rgba(0, 214, 143, 0.15)",
          color: "#00E9A1",
          borderColor: "rgba(0, 214, 143, 0.2)",
        },
        colorWarning: {
          backgroundColor: "rgba(255, 176, 32, 0.15)",
          color: "#FFC247",
          borderColor: "rgba(255, 176, 32, 0.2)",
        },
        colorError: {
          backgroundColor: "rgba(255, 92, 92, 0.15)",
          color: "#FF7B7B",
          borderColor: "rgba(255, 92, 92, 0.2)",
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          background: "linear-gradient(135deg, #5B8CFF 0%, #8B5CF6 100%)",
          border: "2px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 4px 12px rgba(91, 140, 255, 0.2)",
          fontWeight: 700,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "all 0.25s ease",
          borderRadius: "12px",
          "&:hover": {
            backgroundColor: "rgba(91, 140, 255, 0.1)",
            transform: "scale(1.05)",
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: "10px",
          margin: "4px 8px",
          transition: "all 0.25s ease",
          color: "#B8C2E5",
          "&:hover": {
            backgroundColor: "rgba(91, 140, 255, 0.1)",
            transform: "translateX(4px)",
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: "rgba(15, 20, 35, 0.95)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5)",
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: "rgba(255, 255, 255, 0.06)",
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 52,
          height: 30,
          padding: 0,
        },
        switchBase: {
          padding: 3,
          "&.Mui-checked": {
            transform: "translateX(22px)",
            "& + .MuiSwitch-track": {
              backgroundColor: "#5B8CFF",
              opacity: 1,
            },
          },
        },
        thumb: {
          width: 24,
          height: 24,
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        },
        track: {
          borderRadius: 15,
          backgroundColor: "rgba(255, 255, 255, 0.12)",
          opacity: 1,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.08)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(91, 140, 255, 0.2)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#5B8CFF",
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          fontSize: "0.9rem",
          minHeight: 48,
          transition: "all 0.25s ease",
          borderRadius: "10px",
          color: "#B8C2E5",
          "&:hover": {
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            color: "#FFFFFF",
          },
          "&.Mui-selected": {
            color: "#FFFFFF",
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: "3px 3px 0 0",
          background: "linear-gradient(90deg, #5B8CFF 0%, #8B5CF6 100%)",
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "rgba(15, 20, 35, 0.95)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "10px",
          fontSize: "0.8rem",
          padding: "8px 12px",
          color: "#B8C2E5",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
        },
      },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          "& .MuiSnackbarContent-root": {
            backgroundColor: "rgba(15, 20, 35, 0.95)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
            color: "#FFFFFF",
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: "rgba(255, 255, 255, 0.08)",
        },
        bar: {
          background: "linear-gradient(90deg, #5B8CFF 0%, #8B5CF6 100%)",
          borderRadius: 4,
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: "#5B8CFF",
        },
      },
    },
  },
});

export const lightTheme = darkTheme;
