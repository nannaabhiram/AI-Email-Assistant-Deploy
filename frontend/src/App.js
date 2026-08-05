
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { ToastContainer, toast } from "react-toastify";
import Button from "@mui/material/Button";
import { lightTheme, darkTheme } from "./theme/theme";

import Dashboard from "./Dashboard";
import Inbox from "./Inbox";
import Chat from "./Chat";
import EmailDetails from "./EmailDetails";
import Login from "./Login";
import MainLayout from "./layouts/MainLayout";
import Settings from "./Settings";
import socket from "./socket";

function App() {

  const [loggedIn, setLoggedIn] = useState(
    localStorage.getItem("loggedIn") === "true"
  );

  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true"
  );

  useEffect(() => {

    socket.on("gmail_update", (data) => {

      if (!data.email) return;

      toast(

        ({ closeToast }) => (

          <div>

            <h4 style={{ margin: 0 }}>

              🔔 New Email

            </h4>

            <p>

              <b>{data.email.subject}</b>

            </p>

            <p>

              {data.email.sender}

            </p>

            <Button
              variant="contained"
              size="small"
              onClick={() => {

                window.location.href =
                  `/email/${data.email.id}`;

                closeToast();

              }}
            >

              Open Email

            </Button>

          </div>

        ),

        {
          autoClose: 8000
        }

      );

    });

    return () => {

      socket.off("gmail_update");

    };

  }, []);

  const toggleDarkMode = () => {

    const next = !darkMode;

    setDarkMode(next);

    localStorage.setItem(
      "darkMode",
      next
    );

  };

  const logout = () => {

    localStorage.removeItem("loggedIn");

    setLoggedIn(false);

  };

  if (!loggedIn) {

    return (

      <Login
        onLogin={() => setLoggedIn(true)}
      />

    );

  }

  return (

    <ThemeProvider
      theme={
        darkMode
        ?
        darkTheme
        :
        lightTheme
      }
    >

      <CssBaseline />

      <BrowserRouter>

        <Routes>

          <Route
            element={
              <MainLayout
                logout={logout}
                darkMode={darkMode}
                toggleDarkMode={toggleDarkMode}
              />
            }
          >

            <Route
              path="/"
              element={<Dashboard />}
            />

            <Route
              path="/inbox"
              element={<Inbox />}
            />

            <Route
              path="/chat"
              element={<Chat />}
            />

            <Route
              path="/email/:id"
              element={<EmailDetails />}
            />

            <Route
              path="/settings"
              element={<Settings />}
            />

          </Route>

        </Routes>

        <ToastContainer />

      </BrowserRouter>

    </ThemeProvider>

  );

}

export default App;
