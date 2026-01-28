import express from "express";
import cors from "cors";
import multer from "multer";
import session from "express-session";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import https from 'node:https';
import { verifyMessage } from "ethers";
import Agent from './dist/agent/Agent.js';
import { auth } from './dist/agent/Auth.js';
import pg from "./postgres.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3007
const VITE_SERVER_URL = process.env.VITE_SERVER_URL;
const VITE_AGENT_INSTANCE = process.env.VITE_AGENT_INSTANCE;
const CONFIG_PATH = path.resolve(process.cwd(), "agent_config.json");

// database
const db_pg = {};
db_pg.admin = new pg({"database": process.env.DATABASE});

await db_pg.admin.createSchema();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const agent = new Agent(auth, "0x", db_pg); // make sure to pass authentication into the agentic provider
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
      let token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

      if (!token) {
          token = req.body.token;
      }

      const isOwner = token ? auth.isOwnerToken(token) : false;
      const folder = req.user;
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

app.post("/upload", [auth.authorize, upload.single("file")], async (req, res) => {

  if (!req.file) return res.status(400).json({ error: "No file" });

  const relativePath = path.join("data", path.basename(req.file.destination), req.file.filename);

  if (!agent.providers) {
    res.json({});
    return;
  }

  const result = await agent.providers.dataStore.addDataItem({
    name: req.file.originalname,
    path: relativePath,
    owner: req.user || "0x0000000000000000000000000000000000000000",
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
      path: relativePath,
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

    console.log("stream",{message, context, sessionId, address, onToken, onTool})

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

app.post('/authToken', async (req, res) => {

  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  token ? res.json({ token }) : res.status(401).json({ error: "bad token" });

});

app.post('/authUser', async (req, res) => {

  console.log("authUser req.body",req.body)

  const userEOA = req.body.address;
  if (!userEOA) {
    return res.json(null);
  }

  const { address, message, signature } = req.body;
  console.log({ address, message, signature })
  const token = await auth.loginWithSignature(address, message, signature);
  console.log("token",token)
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

app.get(`/${VITE_AGENT_INSTANCE}/avatar`, async (req, res, next) => {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(data);

    if (!config.avatarVideo) {
      return res.status(404).json({ message: "No avatars found" });
    }

    res.json(config.avatarVideo);
  } catch (err) {
    console.error("Error loading agent_config.json:", err);
    res.status(500).json({ error: "Failed to load avatars" });
  }
});

app.get(`/${VITE_AGENT_INSTANCE}/dataStore/:id`, async (req, res, next) => {

  const { id } = req.params;
  if (!id) {
    return res.status(400).send("Missing avatar id");
  }

  // Same lookup logic as getDataItem
  //const item = agent.providers.dataStore.find(i => i.id === id);
  const item_ = await agent.providers.dataStore.getDataItem({ id });
  if (!item_) {
    return res.status(404).send("Avatar not found");
  }
  console.log("item",item_)

  var item;
  try {
      item = JSON.parse(item_);
  } catch (e) {
      console.log(e)
      res.json({error:e});
      return;
  }
  console.log("item",item);
  /**
   * 🚧 PLACEHOLDER — DO NOT ENFORCE YET 🚧
   *
   * We will use this later in pg to make sure this video is an avatar with public ACL
   *
   * if (item.metadata?.type !== "avatarVideo") {
   *   return res.status(403).send("Not an avatar video");
   * }
   *
   * or agent ownership checks.
   */

  const filePath = item.data?.path;

  try {
    await fs.access(filePath);
  } catch (err) {
    console.log("File access failed:", filePath, err.code);
    return res.status(404).send("File missing on disk");
  }

  let fileHandle;

  try {

    fileHandle = await fs.open(filePath, 'r');
    const stat = await fileHandle.stat();
    console.log("stat", stat);

    const range = req.headers.range;

    if (range) {
      // ... parse range exactly as you have ...
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4",
      });

      const stream = fileHandle.createReadStream({ start, end });
      stream.pipe(res);

      // Close only when this stream ends
      stream.on('end', () => fileHandle.close().catch(() => {}));
      stream.on('error', () => fileHandle.close().catch(() => {}));

    } else {
      console.log("deb3 - Sending full video");

      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": stat.size,
        "Accept-Ranges": "bytes",
        //"Cache-Control": "no-cache",
      });

      const stream = fileHandle.createReadStream();

      stream.pipe(res);

      // Close handle only after full stream finishes
      stream.on('end', () => {
        console.log("Full video streamed - closing handle");
        fileHandle.close().catch(() => {});
      });
      stream.on('error', (err) => {
        console.error("Stream error:", err);
        fileHandle.close().catch(() => {});
      });

    }

  } catch (err) {
    if (fileHandle) await fileHandle.close().catch(() => {});

    if (err.code === 'ENOENT') {
      return res.status(404).send("File missing on disk");
    }
    console.error("File handling error:", err);
    return res.status(500).send("Server error");
  }

});

app.get(`/${VITE_AGENT_INSTANCE}/comfy-history/:id`, async (req, res, next) => {
  const r = await fetch(
    `${process.env.VITE_COMFY_URL}/history/${req.params.id}`
  );
  const data = await r.json();
  console.log("/comfyHistory/:id",data)
  res.json(data);
});

// In your Express app (server.js or a dedicated route file)
app.get(`/${VITE_AGENT_INSTANCE}/comfy-view`, async (req, res) => {

  const { filename, subfolder = '', type = 'output' } = req.query;

  if (!filename) {
    return res.status(400).json({ error: 'Missing filename' });
  }

  const comfyUrl = `${process.env.VITE_COMFY_URL}/view?${new URLSearchParams({
    filename,
    subfolder,
    type,
  })}`;

  try {
    const response = await fetch(comfyUrl, {
      headers: {
        // Forward range header from client (browser sends this for seeking/streaming)
        Range: req.headers.range || '',
      },
    });

    if (!response.ok) {
      return res.status(response.status).send(await response.text());
    }

    // Forward important headers
    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');
    const acceptRanges = response.headers.get('accept-ranges') || 'bytes';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // If client requested a range (e.g. seeking in video), forward status 206
    if (req.headers.range && response.status === 206) {
      res.status(206);
    }

    if (response.body) {
      await response.body.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(chunk);
          },
          close() {
            res.end();
          },
          abort(err) {
            console.error('Stream aborted:', err);
            res.end();
          },
        })
      );
    } else {
      res.status(500).json({ error: 'No response body' });
    }

  } catch (err) {
    console.error('Comfy video proxy error:', err);
    res.status(500).json({ error: 'Failed to stream video' });
  }
});

app.get("*", (req, res) => {
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
