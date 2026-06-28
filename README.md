# Tank Wars

Third-person tank demo (Three.js). Drive with W/S, steer A/D, aim with the mouse,
fire with left-click, reset with R. Tracks spin and the belt runs (differential
steering in turns).

## Build the tank asset (one-time, after changing the build pipeline)

```
python tools/build_tank.py
```

Produces `assets/tank.glb` from the source Meshy GLB.

## Run

```
start_server.bat
```

Then open http://localhost:8000 . Do NOT open index.html by double-click (GLB/CORS).

## Tests

- Python build logic: `python tools/tests/test_segment.py` (and the other test_*.py)
- Runtime logic:      `node --test game/tests/`
