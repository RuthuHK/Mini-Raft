const WebSocket = require("ws");
const express = require("express");
const axios = require("axios");
const path = require("path");

const WS_PORT = 3000;
const HTTP_PORT = 5000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const wss = new WebSocket.Server({
  host: "0.0.0.0",
  port: WS_PORT
});

let clients = [];
let leader = null;

// Each item in strokes is one full stroke (array of draw segments)
let strokes = [];
let strokeMap = {}; // strokeId -> stroke array

function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data) {
  for (const client of clients) {
    safeSend(client, data);
  }
}

wss.on("connection", (ws) => {
  clients.push(ws);
  console.log("Client connected");

  safeSend(ws, {
    type: "snapshot",
    strokes
  });

  ws.on("message", async (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (err) {
      console.log("Invalid WebSocket message");
      return;
    }

    if (!leader) {
      console.log("No leader available yet");
      return;
    }

    try {
      await axios.post(`${leader}/append`, data, { timeout: 1000 });
    } catch (err) {
      console.log("Leader append failed:", err.message);
    }
  });

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
    console.log("Client disconnected");
  });
});

app.post("/leader", (req, res) => {
  leader = req.body.leader;
  console.log("New leader:", leader);
  res.sendStatus(200);
});

app.post("/commit", (req, res) => {
  const entry = req.body;
  console.log("Committed:", entry);

  if (entry.type === "draw") {
    if (!entry.strokeId) {
      return res.status(400).json({ error: "Missing strokeId" });
    }

    if (!strokeMap[entry.strokeId]) {
      strokeMap[entry.strokeId] = [];
      strokes.push(strokeMap[entry.strokeId]);
    }

    strokeMap[entry.strokeId].push(entry);
  }

  if (entry.type === "clear") {
    strokes = [];
    strokeMap = {};
  }

  if (entry.type === "undo") {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i];
      if (stroke.length > 0 && stroke[0].clientId === entry.clientId) {
        const strokeId = stroke[0].strokeId;
        strokes.splice(i, 1);
        delete strokeMap[strokeId];
        break;
      }
    }
  }

  broadcast(entry);
  res.sendStatus(200);
});

app.get("/state", (req, res) => {
  res.json({
    leader,
    strokes
  });
});

app.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`Gateway HTTP running on ${HTTP_PORT}`);
});
