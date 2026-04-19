const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT);
const ID = process.env.ID;

let state = "follower";
let term = 0;
let votedFor = null;
let leaderId = null;

let log = [];
let commitIndex = -1;

const replicas = [
  { id: "replica1", url: "http://replica1:4001" },
  { id: "replica2", url: "http://replica2:4002" },
  { id: "replica3", url: "http://replica3:4003" }
];

let electionTimeout = null;

function majorityCount() {
  return Math.floor(replicas.length / 2) + 1;
}

function randomElectionMs() {
  return Math.floor(Math.random() * 300) + 500; // 500-800 ms
}

function resetElectionTimer() {
  clearTimeout(electionTimeout);
  electionTimeout = setTimeout(() => {
    startElection().catch((err) => {
      console.log(`${ID} election error:`, err.message);
    });
  }, randomElectionMs());
}

async function notifyGatewayLeader() {
  try {
    await axios.post("http://gateway:5000/leader", {
      leader: `http://${ID}:${PORT}`
    });
  } catch (err) {
    console.log(`${ID} failed to notify gateway:`, err.message);
  }
}

async function sendHeartbeats() {
  if (state !== "leader") return;

  await Promise.all(
    replicas
      .filter((r) => r.id !== ID)
      .map(async (replica) => {
        try {
          await axios.post(
            `${replica.url}/heartbeat`,
            {
              term,
              leaderId: ID,
              commitIndex
            },
            { timeout: 500 }
          );
        } catch (_) {}
      })
  );

  setTimeout(() => {
    sendHeartbeats().catch(() => {});
  }, 150);
}

async function syncFollowers() {
  if (state !== "leader") return;

  await Promise.all(
    replicas
      .filter((r) => r.id !== ID)
      .map(async (replica) => {
        try {
          await axios.post(
            `${replica.url}/sync-log`,
            {
              term,
              leaderId: ID,
              entries: log,
              commitIndex
            },
            { timeout: 1000 }
          );
        } catch (err) {
          console.log(`${ID} failed to sync ${replica.id}:`, err.message);
        }
      })
  );
}

async function startElection() {
  state = "candidate";
  term += 1;
  votedFor = ID;
  leaderId = null;

  console.log(`${ID} starting election for term ${term}`);

  let votes = 1;

  await Promise.all(
    replicas
      .filter((r) => r.id !== ID)
      .map(async (replica) => {
        try {
          const res = await axios.post(
            `${replica.url}/vote`,
            {
              term,
              candidateId: ID
            },
            { timeout: 500 }
          );

          if (res.data.vote === true) {
            votes += 1;
          }
        } catch (_) {}
      })
  );

  if (votes >= majorityCount()) {
    state = "leader";
    leaderId = ID;
    console.log(`${ID} became leader for term ${term}`);
    await notifyGatewayLeader();
    await syncFollowers();
    await sendHeartbeats();
  } else {
    state = "follower";
  }

  resetElectionTimer();
}

app.post("/vote", (req, res) => {
  const { term: incomingTerm, candidateId } = req.body;

  if (incomingTerm > term) {
    term = incomingTerm;
    state = "follower";
    votedFor = null;
    leaderId = null;
  }

  if (incomingTerm < term) {
    return res.json({ vote: false });
  }

  if (votedFor === null || votedFor === candidateId) {
    votedFor = candidateId;
    resetElectionTimer();
    return res.json({ vote: true });
  }

  return res.json({ vote: false });
});

app.post("/heartbeat", (req, res) => {
  const {
    term: incomingTerm,
    leaderId: incomingLeaderId,
    commitIndex: incomingCommitIndex
  } = req.body;

  if (incomingTerm >= term) {
    term = incomingTerm;
    state = "follower";
    leaderId = incomingLeaderId;

    if (typeof incomingCommitIndex === "number") {
      commitIndex = Math.max(commitIndex, incomingCommitIndex);
    }

    resetElectionTimer();
  }

  res.sendStatus(200);
});

app.post("/append", async (req, res) => {
  if (state !== "leader") {
    return res.status(403).json({ error: "Not leader" });
  }

  const entry = req.body;
  const newIndex = log.length;

  log.push(entry);

  let success = 1;

  await Promise.all(
    replicas
      .filter((r) => r.id !== ID)
      .map(async (replica) => {
        try {
          await axios.post(
            `${replica.url}/replicate`,
            {
              term,
              leaderId: ID,
              index: newIndex,
              entry
            },
            { timeout: 1000 }
          );
          success += 1;
        } catch (_) {}
      })
  );

  if (success >= majorityCount()) {
    commitIndex = newIndex;

    try {
      await axios.post("http://gateway:5000/commit", entry, {
        timeout: 1000
      });
    } catch (err) {
      console.log(`${ID} failed to notify gateway commit:`, err.message);
    }

    return res.sendStatus(200);
  }

  log.pop();
  return res.status(500).json({ error: "Failed to reach majority" });
});

app.post("/replicate", (req, res) => {
  const {
    term: incomingTerm,
    leaderId: incomingLeaderId,
    index,
    entry
  } = req.body;

  if (incomingTerm < term) {
    return res.status(400).json({ error: "Stale term" });
  }

  term = incomingTerm;
  state = "follower";
  leaderId = incomingLeaderId;
  resetElectionTimer();

  if (typeof index !== "number") {
    return res.status(400).json({ error: "Missing index" });
  }

  if (log.length === index) {
    log.push(entry);
    return res.sendStatus(200);
  }

  return res.status(409).json({
    error: "Out of sync",
    followerLogLength: log.length
  });
});

app.post("/sync-log", (req, res) => {
  const {
    term: incomingTerm,
    leaderId: incomingLeaderId,
    entries,
    commitIndex: incomingCommitIndex
  } = req.body;

  if (incomingTerm < term) {
    return res.status(400).json({ error: "Stale term" });
  }

  term = incomingTerm;
  state = "follower";
  leaderId = incomingLeaderId;

  log = Array.isArray(entries) ? [...entries] : [];
  commitIndex =
    typeof incomingCommitIndex === "number"
      ? incomingCommitIndex
      : log.length - 1;

  resetElectionTimer();
  return res.sendStatus(200);
});

app.get("/log", (req, res) => {
  res.json({
    id: ID,
    state,
    term,
    leaderId,
    commitIndex,
    log
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Replica ${ID} running on port ${PORT}`);
  resetElectionTimer();
});
