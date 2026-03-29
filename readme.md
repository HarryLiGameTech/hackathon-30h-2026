# TrentNavigator: A LLM-assisted personalized indoor navigation and query system


## Overview

This is an AI agent for indoor navigation and information queries within the Trent Building. It leverages the indoor-topo-navi repository as its foundational navigation system to provide:

Indoor wayfinding — Users can query directions to specific rooms, facilities, or points of interest within the Trent Building
Information retrieval — The agent answers questions about building amenities, operating hours, event schedules, and other general queries
Path planning — Integrates with the indoor topology navigation backend to compute optimal routes between locations

For in-depth technical details, please visit: https://github.com/HarryLiGameTech/indoor-topo-navi

## How to Run

1. Launch business backend (indoor-topo-navi)
```bash
./run.sh
```

2. Launch mcp server
```bash
cd ../trent-navigator-mcp-server
npm run build
npm start
```

3. Launch agent backend (orchestrator)
```bash
cd ../agent-backend
npm run build
npm start
```

4. Launch PC-web frontend / Mobile App

**PC frontend**: Run `npm run dev`, and go to http://localhost:5173' in your browser

**Mobile App**: Download the apk from the Releases