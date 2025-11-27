import express from "express";
import cors from "cors";
import multer from "multer";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import AgentKitNode from './dist/agent/AgentKitNode.js';
import { auth } from './dist/agent/AgentAuth.js';
import https from 'node:https';
import { verifyMessage } from "ethers";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3007

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "dist")));

// stateful sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secretagent",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

//app.use(express.static(path.join(__dirname, "public")));

const agent = new https.Agent({
    "rejectUnauthorized": false
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

app.post("/api/upload", upload.single("file"), (req, res) => {
  const metadata = {
    title: req.body.title,
    description: req.body.description,
    filename: req.file.filename,
  };
  res.json(metadata);
});

app.get('/agent', async (req, res) => {

    // streaming headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("X-Accel-Buffering", "no"); 
    res.setHeader("Transfer-Encoding", "chunked");

    const message = req.query.message;
    console.log("message",message);

    res.flushHeaders();

    const onToken = (token) => {
        res.write(`event: token\ndata: ${token}\n\n`);
        res.flush?.();
    };

    const stream = await AgentKitNode.askStream(message, onToken);

    res.write(`event: done\ndata: ${JSON.stringify(stream)}\n\n`);

    res.end();

});

app.post("/claim", async (req, res) => {

  const userEOA = req.body.address;
  if (!userEOA) {
    return res.json(null);
  }

  const owner = auth.getOwnerWalletAddress();
  const { address, message, signature } = req.body;
  const claimed = await auth.claimAgent(address);
  const token = await auth.loginWithSignature(address, message, signature);
  token ? res.json({ token, claimed }) : res.status(401).json({ error: "bad signature" });

});

app.post('/authUser', async (req, res) => {

  const userEOA = req.query.address;
  if (!userEOA) {
    return res.json(null);
  }

  const { address, message, signature } = req.body;
  const token = await auth.loginWithSignature(address, message, signature);
  token ? res.json({ token }) : res.status(401).json({ error: "bad sign" });

});

app.get('/getOwner', async (req, res, next) => {

  const userEOA = req.query.address;
  if (!userEOA) {
    return res.json(null);
  }

  const owner = await auth.getOwnerWalletAddress(userEOA);
  const nonce = crypto.randomUUID();
  req.session.nonce = nonce;

  res.json({owner,nonce} || null);

});

app.get("*", (req, res) => {
  //res.sendFile(path.join(__dirname, "public", "index.html"));
  res.sendFile(path.join(__dirname, "index.html"));
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("Port 3007 busy, trying 3008...");
    app.listen(3008, "0.0.0.0", () => console.log("Now running on 3008"));
  }
});
