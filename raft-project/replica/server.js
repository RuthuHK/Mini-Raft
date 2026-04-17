const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT;
const ID = process.env.ID;

let state = "follower";
let term = 0;
let votedFor = null;
let log = [];

const replicas = [
  "http://replica1:4001",
  "http://replica2:4002",
  "http://replica3:4003"
];

let leader = null;
let electionTimeout;

/* ---------------- ELECTION TIMER ---------------- */

function resetElectionTimer() {
  clearTimeout(electionTimeout);

  electionTimeout = setTimeout(() => {
    startElection();
  }, Math.floor(Math.random() * 300) + 500); // 500–800 ms
}

/* ---------------- START ELECTION ---------------- */

async function startElection() {
  state = "candidate";
  term++;
  votedFor = ID;

  console.log(ID, "starting election (term " + term + ")");

  let votes = 1;

  await Promise.all(replicas.map(async (r) => {
    if (!r.includes(ID)) {
      try {
        const res = await axios.post(`${r}/vote`, { term, candidateId: ID });
        if (res.data.vote) votes++;
      } catch {}
    }
  }));

  if (votes >= 2) {
    state = "leader";
    leader = ID;

    console.log(ID, "is leader (term " + term + ")");

    // 🔥 INFORM GATEWAY
    try {
      await axios.post("http://gateway:5000/leader", {
        leader: `http://${ID}:${PORT}`
      });
    } catch (err) {
      console.log("Failed to notify gateway");
    }

    sendHeartbeat();
  } else {
    state = "follower";
  }

  resetElectionTimer();
}

/* ---------------- HEARTBEAT ---------------- */

function sendHeartbeat() {
  if (state !== "leader") return;

  replicas.forEach(r => {
    if (!r.includes(ID)) {
      axios.post(`${r}/heartbeat`, {
        term,
        leader: ID
      }).catch(()=>{});
    }
  });

  setTimeout(sendHeartbeat, 150);
}

/* ---------------- ROUTES ---------------- */

app.post("/vote", (req, res) => {
  const { term: incomingTerm, candidateId } = req.body;

  if (incomingTerm > term) {
    term = incomingTerm;
    votedFor = null;
    state = "follower";
  }

  if (!votedFor) {
    votedFor = candidateId;
    resetElectionTimer();
    return res.json({ vote: true });
  }

  res.json({ vote: false });
});

app.post("/heartbeat", (req, res) => {
  const { term: incomingTerm, leader: leaderId } = req.body;

  if (incomingTerm >= term) {
    term = incomingTerm;
    state = "follower";
    leader = leaderId;
    resetElectionTimer();
  }

  res.sendStatus(200);
});

/* ---------------- APPEND ---------------- */

app.post("/append", async (req, res) => {
  if (state !== "leader") {
    console.log(ID, "rejected append (not leader)");
    return res.sendStatus(403);
  }

  const entry = req.body;
  log.push(entry);

  let success = 1;

  await Promise.all(replicas.map(async (r) => {
    if (!r.includes(ID)) {
      try {
        await axios.post(`${r}/replicate`, entry);
        success++;
      } catch {}
    }
  }));

  if (success >= 2) {
    try {
      await axios.post("http://gateway:5000/commit", entry);
    } catch (err) {
      console.log("Commit failed:", err.message);
    }
  }

  res.sendStatus(200);
});

/* ---------------- REPLICATE ---------------- */

app.post("/replicate", (req, res) => {
  log.push(req.body);
  res.sendStatus(200);
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`Replica ${ID} running on ${PORT}`);
  resetElectionTimer();
});