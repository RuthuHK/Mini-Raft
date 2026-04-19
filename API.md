# API Documentation

## Gateway API

### `POST /leader`
Updates the gateway with the currently elected leader.

**Request body**
```json
{
  "leader": "http://replica1:4001"
}
```

**Response**
- `200 OK`

---

### `POST /commit`
Sent by the leader when a drawing event is committed.

**Request body**
```json
{
  "x0": 10,
  "y0": 20,
  "x1": 50,
  "y1": 70,
  "color": "#000000",
  "size": 2
}
```

**Response**
- `200 OK`

---

## Replica API

### `POST /vote`
Vote request used during elections.

**Request body**
```json
{
  "term": 3,
  "candidateId": "replica2"
}
```

**Response body**
```json
{
  "vote": true
}
```

---

### `POST /heartbeat`
Heartbeat sent by the leader to followers.

**Request body**
```json
{
  "term": 3,
  "leader": "replica2"
}
```

**Response**
- `200 OK`

---

### `POST /append`
Called by the gateway on the current leader to append a drawing event.

**Request body**
```json
{
  "x0": 10,
  "y0": 20,
  "x1": 50,
  "y1": 70,
  "color": "#000000",
  "size": 2
}
```

**Response**
- `200 OK` on success
- `403` if the contacted replica is not the leader

---

### `POST /replicate`
Called by the leader on follower replicas to replicate the entry.

**Request body**
```json
{
  "x0": 10,
  "y0": 20,
  "x1": 50,
  "y1": 70,
  "color": "#000000",
  "size": 2
}
```

**Response**
- `200 OK`

---

## Assignment-aligned API additions recommended

To match the assignment document more closely, add these routes:
- `POST /request-vote`
- `POST /append-entries`
- `POST /heartbeat`
- `POST /sync-log`
