# Testing Guide

## 1. Startup validation

Run:
```bash
docker compose up --build
```

Check:
- gateway starts successfully
- all three replicas start successfully
- one replica becomes leader

---

## 2. Multi-client synchronization

Steps:
1. Open the frontend in two or more browser tabs.
2. Draw in one tab.
3. Confirm that all other tabs receive the committed drawing update.

Expected result:
- drawing appears consistently for all connected clients

---

## 3. Leader failover

Steps:
1. Identify the leader from logs.
2. Stop that replica container.
3. Watch remaining replica logs.
4. Continue drawing after a new leader is elected.

Commands:
```bash
docker compose logs -f replica1 replica2 replica3 gateway
docker compose stop replica1
```

Expected result:
- a different replica becomes leader
- gateway updates its leader reference
- new drawing events still work

---

## 4. Follower loss tolerance

Steps:
1. Start the system.
2. Stop one follower.
3. Continue drawing.

Expected result:
- leader still commits entries with majority quorum

---

## 5. Restart behavior

Steps:
1. Stop a follower.
2. Start it again.
3. Observe whether it rejoins correctly.

Expected result for the final assignment:
- restarted node should catch up through sync-log or equivalent recovery

Current repo note:
- this part is not fully implemented yet and should be improved

---

## 6. Stress validation

Try:
- many strokes in quick succession
- multiple browser tabs at once
- leader kill during active drawing

Expected result:
- no total service outage
- clients remain connected
- cluster recovers leadership automatically
