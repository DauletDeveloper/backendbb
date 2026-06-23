const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const app = express();
app.set("trust proxy", 1);
const router = require("./routs/rout.js");
const db = require("./db");

app.use(cors({
  origin: ["https://barberbase.site"],
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());
app.use("/api", router);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log("db connected", !!db);
});
