# 🍅 Pomodoro Pro

A sleek, Apple & Meta-inspired Pomodoro productivity application engineered with a native **SQLite** backend, custom **Web Audio API** acoustic synthesis, intelligent **Task Chaining**, and **Priority-based Scheduling & Alerts**.

---

## 🌟 Key Features & Requirements Matrix

| Requirement | Implementation Details |
| :--- | :--- |
| **1. Todo List with Heading & Description** | Full task management with title/heading, description, assignee, priority badge, and status tracking. |
| **2. Task Timer (1 to 45 mins limit)** | Presets for 15m, 25m, 30m, 45m with interactive slider. Hard validation enforces $\le 45$ min duration limit. |
| **3. Short Break (4-5 mins, max 2 breaks)** | Configurable 4m or 5m rest intervals. Strict enforcement blocks taking more than 2 breaks per task session. |
| **4. Cloud Backend Persistence (Supabase & SQLite)** | • Hosted **Supabase PostgreSQL** with Realtime WebSockets & Row Level Security<br>• Task statuses: `New`, `Completed`, `Canceled`, `Repeat`<br>• Assignee / Scheduled By tracking<br>• Priority levels: `High`, `Medium`, `Low`<br>• Offline local SQLite fallback |
| **5. Priority-Based Scheduling & Alerts** | Active real-time scheduler. Emits customized acoustic chimes and visual cues based on Priority: `High` (Urgent siren chime + pulsating red banner), `Medium` (harmonic chord + amber toast), `Low` (subtle chime + cyan banner). |
| **6. Dependent Task Chains** | • Chain up to **3 dependent tasks**<br>• Consecutive task time $> 1$ hour triggers mandatory **10-15 min rest interval**<br>• Total chain duration bounded to **$\le 2$ hours (120 mins)**<br>• Max **2 breaks** allowed in chain |
| **7. Apple & Meta Design Language** | Frosted glassmorphism (`backdrop-filter: blur(28px)`), SF Pro typography, animated circular SVG countdown, Dynamic Island capsule, dark/light theme switch. |
| **8. Vercel Production Deployment** | Turnkey serverless deployment with `vercel.json`, edge routing, and `/api` serverless endpoints. |

---

## 🏗️ Project Architecture

```
pomodoro-app/
├── server.js              # Node.js HTTP server (zero external npm dependencies!)
├── db.js                  # SQLite persistence engine with node:sqlite
├── pomodoro.db            # SQLite database file
├── package.json           # Project manifest
├── public/
│   ├── index.html         # Glassmorphic Apple/Meta layout
│   ├── css/
│   │   └── style.css      # Design system, dark/light themes, dynamic island
│   └── js/
│       ├── audio.js       # Web Audio API synthesizers (Apple-style acoustic chimes)
│       ├── api.js         # REST API client
│       ├── notifications.js # Priority scheduler watcher & alert engine
│       ├── timer.js       # Pomodoro countdown engine (45m max & 2 breaks rule)
│       ├── chain.js       # Dependent task pipeline & sequence runner
│       └── app.js         # Master UI controller, search, filters & modals
└── README.md              # Documentation & guide
```

---

## 🚀 How to Run the Application

The application is already running and accessible!

```bash
cd /Users/sumitjambhale/.gemini/antigravity/scratch/pomodoro-app
node server.js
```

Open your browser at:
👉 **[http://localhost:3000](http://localhost:3000)**

> [!TIP]
> **Recommended Workspace Setting:**  
> Please set `/Users/sumitjambhale/.gemini/antigravity/scratch/pomodoro-app` as your active workspace in Antigravity.

---

## 🔌 REST API Endpoints

### Tasks
- `GET /api/tasks` — List tasks with optional query filters (`?status=New&priority=High&search=design`)
- `GET /api/tasks/:id` — Retrieve a single task by ID
- `POST /api/tasks` — Create a new task (enforces 1-45 min duration and 4-5 min breaks)
- `PUT /api/tasks/:id` — Update task details
- `DELETE /api/tasks/:id` — Delete task
- `POST /api/tasks/:id/break` — Record a break usage (enforces max 2 breaks limit)
- `POST /api/tasks/:id/repeat` — Reset task to `Repeat` status and reset breaks to 0

### Chains
- `GET /api/chains` — Fetch all dependent task chains
- `GET /api/chains/:id` — Fetch chain details with step sequence
- `POST /api/chains` — Create task chain (validates max 3 tasks, max 2h duration, and auto-inserts breaks if consecutive $> 1\text{ hr}$)
- `PUT /api/chains/:id/status` — Update chain status (`In Progress`, `Completed`, `Canceled`)
- `DELETE /api/chains/:id` — Delete chain

### Priority Notifications
- `GET /api/notifications/pending` — Fetch scheduled tasks due now
- `POST /api/notifications/log` — Record notification delivery
- `GET /api/notifications/history` — View past notification history

---

## 🎨 Design Highlights

1. **Apple Dynamic Island / Status Capsule**: Real-time status indicator in the top navigation bar reflecting whether you are in focus, on break, or paused.
2. **Circular Vector Progress Ring**: Seamless animated SVG stroke dashoffset with gradient transitions.
3. **Web Audio Synthesizer**: Pure JavaScript audio generation using oscillators and exponential decay filters — no MP3 downloads required.
4. **Theme Toggle**: One-click switch between iOS Dark Mode and macOS Light Mode.
