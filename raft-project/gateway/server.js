const WebSocket = require("ws");
const axios = require("axios");

const wss = new WebSocket.Server({ host: "0.0.0.0", port: 3000 });

let clients = [];
let leader = null; // 🔥 start empty (important)

/* ---------------- WEBSOCKET ---------------- */

wss.on("connection", (ws) => {
  clients.push(ws);
  console.log("Client connected");

  ws.on("message", async (message) => {
    const data = JSON.parse(message);

    if (!leader) {
      console.log("No leader yet, dropping message");
      return;
    }

    try {
      await axios.post(`${leader}/append`, data);
    } catch (err) {
      console.log("Leader error:", err.message);

      // 🔥 RETRY AFTER SMALL DELAY (IMPORTANT FIX)
      setTimeout(async () => {
        try {
          await axios.post(`${leader}/append`, data);
        } catch (e) {
          console.log("Retry failed:", e.message);
        }
      }, 200);
    }
  });

  // remove disconnected clients
  ws.on("close", () => {
    clients = clients.filter(c => c !== ws);
    console.log("Client disconnected");
  });
});

/* ---------------- BROADCAST ---------------- */

function broadcast(data) {
  console.log("Broadcasting:", data);

  clients.forEach(c => {
    if (c.readyState === 1) {
      c.send(JSON.stringify(data));
    }
  });
}

/* ---------------- HTTP SERVER ---------------- */

const express = require("express");
const app = express();
app.use(express.json());

/* 🔥 RECEIVE COMMITTED DATA */
app.post("/commit", (req, res) => {
  console.log("COMMIT RECEIVED:", req.body);
  broadcast(req.body);
  res.sendStatus(200);
});

/* 🔥 RECEIVE LEADER UPDATE */
app.post("/leader", (req, res) => {
  leader = req.body.leader;
  console.log("NEW LEADER:", leader);
  res.sendStatus(200);
});

app.listen(5000, () => console.log("Gateway HTTP running"));