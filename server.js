import express from "express";
import cors from "cors";
import multer from "multer";
import session from "express-session";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import https from 'node:https';
import { verifyMessage } from "ethers";
import Agent from './dist/agent/Agent.js';
import { auth } from './dist/agent/Auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3007
const CONFIG_PATH = path.resolve(process.cwd(), "llm_config.json");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const agent = new Agent(auth); // make sure to pass authentication into the agentic provider
await agent.init();

let configAtom = null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/media", express.static(path.join(__dirname, "media")));


// stateful sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secretagent",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

const httpsAgent = new https.Agent({
    "rejectUnauthorized": false
});

const storage = multer.diskStorage({

  // determine location for upload, user upload or owner
  // TODO, segragate by user.
  destination: (req, file, cb) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

      const isOwner = token ? auth.isOwnerToken(token) : false;
      const folder = isOwner ? "owner" : "user";
      const dir = path.join(process.cwd(), "data", folder);
      fs.mkdir(dir, { recursive: true })
      .then(() => {
        console.log("mkdir done:", dir);
        cb(null, dir);
      })
      .catch(err => cb(err));

    } catch(e) {
      console.error(e)
    }

  },

  filename: (req, file, cb) => {
    let filename = crypto.randomUUID() + path.extname(file.originalname);
    cb(null, filename);
    console.log("filename done");
  }

});

const upload = multer({ storage,
  limits: { fileSize: 400 * 1024 * 1024 } // 400MB max file
});

app.post("/upload", upload.single("file"), async (req, res) => {

  if (!req.file) return res.status(400).json({ error: "No file" });

  const token = req.body.token;
  const isOwner = token ? auth.isOwner(token) : false;
  const folder = isOwner ? "owner" : "user";

  // Correct full path — no more hardcoded "user"
  const fullPath = path.join(process.cwd(), "data", folder, req.file.filename);

  if (!agent.providers) {
    res.json({});
    return;
  }

  console.log("agent.providers",agent.providers)
  const result = await agent.providers.dataStore.addDataItem({
    name: req.file.originalname,
    path: fullPath,
    owner: req.user?.address || "0x0000000000000000000000000000000000000000",
    agentId: null,
    type: "pending",
    description: req.body.description || null,
  });

  console.log("result",result);

  // get id
  try {
    const itemId = result.match(/data-[^\s]+/)?.[0] || "unknown";
    console.log("try get itemId",itemId)

    res.json({
      success: true,
      id: itemId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: fullPath,
    });

  } catch(e) {
    console.error(e)
  }

});

app.post('/saveConfig', auth.isOwnerRequest, async (req, res) => {
  console.log("save config")
  try {
    await saveConfig(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Config save failed:', err);
    res.status(500).json({ error: 'Save failed' });
  }
});

app.get('/getConfig', auth.isOwnerRequest, async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    console.error('Config save failed:', err);
    res.status(500).json({ error: 'Save failed' });
  }
});

async function saveConfigAtomic(newConfig) {
  const previous = configAtom;

  const save = (async () => {
    if (previous) await previous; 
    const tmp = CONFIG_PATH + '.tmp.' + Date.now();

    await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(newConfig, null, 2));
    await fs.rename(tmp, CONFIG_PATH);
    console.log("saved config",newConfig)
  })();

  configAtom = save.finally(() => { configAtom = null; });
  await save;
}

async function getConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      return {}; // or null, your choice
    }
    throw err;
  }
}

app.get('/agent', async (req, res) => {

    // streaming headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("X-Accel-Buffering", "no"); 
    res.setHeader("Transfer-Encoding", "chunked");

    const message = req.query.message;
    const context = req.query.context;
    const jwToken = decodeURIComponent(req.query.jwToken).trim();
    const sessionId = req.sessionID;
    console.log("jwToken",jwToken)
    const address = auth.authenticateToken(jwToken);
    console.log("/agent address",address)

    if (!message) {
        res.end();
        return;
    }

    res.flushHeaders();

    const onToken = (token) => {
        res.write(`event: token\ndata: ${token}\n\n`);
        res.flush?.();
    };

    // Tool outout
    const onTool = (token) => {
        res.write(`event: tool\ndata: ${token}\n\n`);
        res.flush?.();
    };

    console.log("server sessionId",sessionId)

    const stream = await agent.askStream(message, context, sessionId, address, onToken, onTool);

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
  res.sendFile(path.join(__dirname, "public/index.html"));
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
