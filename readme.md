# Overview

(A Trent Building indoor navigation and info query agent built upon the indoor-topo-navi repository)

# How to Run

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