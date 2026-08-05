import {
  Box,
  Paper,
  Typography
} from "@mui/material";

function StatCard({
  title,
  value,
  color,
  icon
}) {

  return (

    <Paper
      elevation={4}
      sx={{
        p: 2.5,
        borderRadius: 4,
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: "100%"
      }}
    >

      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-start"
      >

        <Box>

          <Typography
            color="text.secondary"
            fontSize={15}
          >
            {title}
          </Typography>

          <Typography
            sx={{
              fontSize: 48,
              fontWeight: 700,
              mt: 1
            }}
          >
            {value}
          </Typography>

        </Box>

        <Box
          sx={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: color,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            fontSize: 28
          }}
        >

          {icon}

        </Box>

      </Box>

    </Paper>

  );

}

export default StatCard;