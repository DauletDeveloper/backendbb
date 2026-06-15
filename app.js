const express = require("express");
const cookieParser = require('cookie-parser');
const cors = require("cors");
const app = express();
const router = require("./routs/rout.js");
const { startSubscriptionCron } = require('./services/Admin/SubscriptionService');
const db = require("./db");
app.use(cookieParser());
app.use(cors({
  origin: ["barberbase.site"],
  credentials: true,
}));
app.use(express.json());
startSubscriptionCron();
app.use("/api", router);
const PORT = process.env.PORT || 5000;
function launchServer() {
  try {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log("db connected", !!db);
    });
  } catch (error) {
    console.error("Error starting the server:", error);
  }
}
launchServer();