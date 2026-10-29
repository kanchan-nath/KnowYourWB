# Bengal Heritage Atlas — Discover the Heritage of West Bengal

A responsive, database-driven heritage tourism web application showcasing the historical, cultural, architectural, religious, and natural heritage of West Bengal, India.

---

## 🏛️ Project Overview

**Bengal Heritage Atlas** is built with a minimal, high-performance vanilla technology stack (no heavy frontend frameworks, no bloated UI kits, and pure Node.js with the built-in HTTP module and MySQL 8).

### Highlights:
- **Cinematic & Editorial Visual Design:** Sophisticated color palette drawn from Bengal's landscape and architecture (Terracotta, Forest Green, Ivory, Warm Gold, Sandstone, and Charcoal).
- **Responsive & Accessible:** Fluid layouts tested across desktop, tablet, and mobile with keyboard navigability, semantic HTML5, and full `prefers-reduced-motion` compliance.
- **Database Driven:** Powered by MySQL 8 with a normalized schema, prepared statements, and verified historical records.
- **Interactive Heritage Map:** Stylized regional map with interactive destination markers, category/region filtering, and live previews.
- **Historical Timeline:** Animated historical progression spanning the Mauryan era through the Gupta, Pala, Bengal Sultanate, Nawabi, Colonial, and Modern eras up to the 2023 UNESCO inscription of Santiniketan.
- **Dedicated Destination Explorer:** Real-time multi-criteria filtering (search keywords, categories, districts, and sorting), paginated database results, and client-side favorites stored in `localStorage`.
- **In-depth Destination Detail Pages:** In-depth historical backgrounds, cultural significance, quick facts, UNESCO verified statuses, visitor information (hours, tickets, accessibility), verified GPS coordinates with Google Maps links, and related destinations.
- **Administrative CRUD Dashboard:** Secure authentication with `bcryptjs` password hashing, token-based session management, and full Create, Read, Update, and Delete operations for heritage records.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | HTML5, CSS3 Custom Properties, Vanilla JavaScript (ES6+), SVG, Browser APIs (`IntersectionObserver`, `localStorage`) |
| **Backend** | Node.js (Built-in `http`, `fs`, `path`, `crypto`, `url` modules — No Express), `mysql2` connection pool, `bcryptjs` |
| **Database** | MySQL 8 (Normalized schema, Foreign Keys, Indexes, Prepared Statements) |
| **Styling & Fonts** | Custom CSS design system, Playfair Display, Inter, Cormorant Garamond |

---

## 📁 Project Structure

```text
FindUS/
├── public/
│   ├── index.html              # Cinematic Home Page (Hero, Stats, Featured, Timeline, Map, Gallery)
│   ├── destinations.html       # Destination Explorer (Search, Filters, Pagination, Favorites)
│   ├── destination.html        # Detailed Destination View (History, Gallery, Facts, Visitor Info)
│   ├── admin.html              # Administrative Portal (Auth, Management Table, Add/Edit/Delete Modals)
│   ├── css/
│   │   └── styles.css          # Comprehensive CSS design system (tokens, animations, responsive)
│   ├── js/
│   │   ├── main.js             # Shared utilities (API helper, navigation, favorites, toast notifications)
│   │   ├── destinations.js     # Explorer logic (filtering, search, pagination)
│   │   ├── destination-detail.js # Detail view rendering & related destinations
│   │   └── admin.js            # Admin CRUD handlers, token verification, modal workflows
│   └── assets/
│       └── images/
│           └── placeholder.jpg # High-res SVG fallback graphic
├── db/
│   ├── schema.sql              # Normalized MySQL 8 table schemas & indexes
│   └── seed.sql                # 22+ researched starter destinations, 10 categories, 17 timeline events
├── server.js                   # Minimal Node.js HTTP server & REST API
├── .env.example                # Environment variables template
├── .env                        # Local environment configuration
├── .gitignore                  # Git exclusions
├── package.json                # Project dependencies (mysql2, bcryptjs)
└── README.md                   # Complete documentation & setup guide
```

---

## 🚀 Quick Start & Installation

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher recommended)
- **MySQL Server 8.0+** running locally or via Homebrew/Docker
- **MySQL Workbench** (optional, for graphical inspection)

### 2. Clone / Setup the Repository
```bash
git clone <repository_url>
cd FindUS
npm install
```

### 3. Environment Variables Configuration
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your MySQL credentials:
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=bengal_heritage_atlas
ADMIN_SESSION_SECRET=bengal_heritage_atlas_super_secret_session_key_2024
PORT=3005
```

> **Note for macOS Homebrew MySQL Users:**  
> The backend automatically detects standard Homebrew unix sockets (`/tmp/mysql_brew.sock` and `/tmp/mysql.sock`), allowing passwordless socket connections if configured on your local machine.

---

## 🗄️ Database Setup & Seeding

### Option A: Command Line Setup
Run the schema and seed scripts using the MySQL client:
```bash
# 1. Create the schema and tables
mysql -u root -p < db/schema.sql

# 2. Populate the tables with starter data
mysql -u root -p < db/seed.sql
```
*(If your local root user has no password, omit the `-p` flag).*

### Option B: Using MySQL Workbench
1. Open **MySQL Workbench** and connect to your local MySQL instance.
2. Go to **File → Open SQL Script...** and select `db/schema.sql`.
3. Click the ⚡ **Execute** button (Ctrl+Shift+Enter / Cmd+Shift+Enter) to create the `bengal_heritage_atlas` database and tables.
4. Go to **File → Open SQL Script...** and select `db/seed.sql`.
5. Click ⚡ **Execute** to seed categories, destinations, timeline milestones, and the administrator account.
6. Verify in the **Navigator / Schemas** panel by running:
   ```sql
   USE bengal_heritage_atlas;
   SELECT COUNT(*) FROM destinations; -- Returns 22
   ```

---

## 🖥️ Running the Application

Start the Node.js backend server:
```bash
npm start
```
Or with auto-restart on changes:
```bash
npm run dev
```

The application will be accessible in your web browser at:
👉 **`http://localhost:3005`**

---

## 🔑 Default Administrator Credentials

To access the administrative dashboard:
1. Navigate to: **`http://localhost:3005/admin.html`**
2. **Username:** `admin`
3. **Password:** `admin123`

The administrative interface provides:
- Live statistics (total destinations, featured landmarks, UNESCO designations).
- Search and category filtering of destination records.
- Creating new destinations with automatic slugification and GPS coordinates.
- Editing existing records.
- Safe deletion with a double-confirmation modal.

---

## 📡 REST API Reference

All responses return standard JSON.

### Public Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/destinations` | List destinations (supports `?search=`, `?category=`, `?district=`, `?region=`, `?sort=`, `?page=`, `?limit=`) |
| `GET` | `/api/destinations/featured` | Retrieve featured destinations for homepage display |
| `GET` | `/api/destinations/:slug` | Retrieve single destination by slug with galleries and related sites |
| `GET` | `/api/categories` | List all heritage categories with destination counts |
| `GET` | `/api/stats` | Return summary metrics (destinations, categories, districts, UNESCO sites) |
| `GET` | `/api/timeline` | List historical milestones in chronological sequence |
| `GET` | `/api/districts` | List distinct districts with counts |

### Administrator Endpoints (Protected)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/admin/login` | Sign in with username & password; returns bearer token |
| `POST` | `/api/admin/logout` | Invalidate active session token |
| `GET` | `/api/admin/verify` | Verify token status |
| `GET` | `/api/admin/destinations` | Retrieve all database records with admin fields |
| `POST` | `/api/admin/destinations` | Create a new heritage destination |
| `PUT` | `/api/admin/destinations/:id`| Update an existing destination record |
| `DELETE`| `/api/admin/destinations/:id`| Permanently remove a destination and its gallery associations |

---

## 🔍 Troubleshooting

| Issue | Cause & Solution |
|---|---|
| **Port in use error (`EADDRINUSE`)** | Another process is occupying the configured port. Change `PORT=3006` in `.env` and restart. |
| **MySQL `Access denied for user`** | Check your `DB_USER` and `DB_PASSWORD` in `.env`. Verify your user privileges with `mysql -u <user> -p`. |
| **Database `ECONNREFUSED`** | Ensure the MySQL daemon is running: `brew services start mysql` on macOS, or `sudo systemctl start mysql` on Linux. |
| **Admin login fails** | Ensure `db/seed.sql` has been executed to create the `admin` account with the bcrypt hash. |

---

## 📄 License
MIT License. Built for cultural appreciation and digital preservation of the heritage of West Bengal, India.

