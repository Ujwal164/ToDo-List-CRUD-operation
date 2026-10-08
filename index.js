import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import dotenv from "dotenv";

dotenv.config();

const saltRounds = 10;
const app = express();
const port = process.env.PORT || 3000;

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  // Local PostgreSQL usually has SSL disabled; enable it explicitly for hosted databases.
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});
db.connect().catch((err) => {
  console.error("Unable to connect to PostgreSQL:", err.message);
});

const taskFields = `
  id,
  title,
  COALESCE(status, 'pending') AS status,
  COALESCE(priority, 'medium') AS priority,
  due_date,
  COALESCE(category, 'Personal') AS category,
  created_at
`;

function calculateStats(items) {
  const total = items.length;
  const completed = items.filter((item) => item.status === "completed").length;
  const pending = total - completed;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, pending, percentage };
}

function wantsJson(req) {
  return req.xhr || req.headers.accept?.includes("application/json");
}

// Blocks task routes for logged-out users: API calls get 401, pages redirect to /login.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  if (req.path.startsWith("/api") || wantsJson(req)) {
    return res.status(401).json({ error: "Please log in" });
  }
  res.redirect("/login");
}

// Keeps logged-in users away from the login/register pages.
function redirectIfAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/");
  }
  next();
}

// ---------- Auth routes ----------

app.get("/login", redirectIfAuthenticated, (req, res) => {
  res.render("login.ejs");
});

app.get("/register", redirectIfAuthenticated, (req, res) => {
  res.render("register.ejs");
});

app.post("/register", async (req, res, next) => {
  const email = (req.body.username || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!email || !password) {
    return res.redirect("/register");
  }

  try {
    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.redirect("/login");
    }

    const hash = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
      [email, hash]
    );
    const user = result.rows[0];

    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      res.redirect("/");
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to register");
  }
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  })
);

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/login");
  });
});

// ---------- Task routes (all require login) ----------

// Auth routes above always respond, so only task routes reach this guard.
app.use(ensureAuthenticated);

app.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ${taskFields} FROM items WHERE user_id = $1 ORDER BY status DESC, due_date NULLS LAST, created_at DESC, id DESC`,
      [req.user.id]
    );
    const items = result.rows;
    const stats = calculateStats(items);

    res.render("index.ejs", {
      listTitle: "Your tasks",
      listItems: items,
      stats,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to load tasks");
  }
});

// API: Get all tasks & live stats
app.get("/api/tasks", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ${taskFields} FROM items WHERE user_id = $1 ORDER BY status DESC, due_date NULLS LAST, created_at DESC, id DESC`,
      [req.user.id]
    );
    const items = result.rows;
    const stats = calculateStats(items);
    res.json({ tasks: items, stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load tasks" });
  }
});

// API & Form: Add Task
app.post("/api/tasks", async (req, res) => {
  const { title, newItem, priority = "medium", dueDate = null, category = "Personal" } = req.body;
  const taskTitle = (title || newItem || "").trim();
  if (!taskTitle) {
    return res.status(400).json({ error: "Task title cannot be empty" });
  }
  try {
    const result = await db.query(
      `INSERT INTO items (title, priority, due_date, category, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING ${taskFields}`,
      [taskTitle, priority, dueDate || null, category, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to add task" });
  }
});

app.post("/add", async (req, res) => {
  const { newItem, title, priority = "medium", dueDate = null, category = "Personal" } = req.body;
  const taskTitle = (newItem || title || "").trim();
  if (!taskTitle) {
    return res.redirect("/");
  }
  try {
    const result = await db.query(
      `INSERT INTO items (title, priority, due_date, category, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING ${taskFields}`,
      [taskTitle, priority, dueDate || null, category, req.user.id]
    );
    if (wantsJson(req)) {
      return res.status(201).json(result.rows[0]);
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    if (wantsJson(req)) {
      return res.status(500).json({ error: "Unable to add task" });
    }
    res.status(500).send("Unable to add task");
  }
});

// API & Form: Edit Task
app.patch("/api/tasks/:id", async (req, res) => {
  const { title, updatedItemTitle, priority, updatedItemPriority = "medium", dueDate, updatedItemDueDate = null, category, updatedItemCategory = "Personal" } = req.body;
  const taskTitle = (title || updatedItemTitle || "").trim();
  const taskPriority = priority || updatedItemPriority;
  const taskDueDate = dueDate !== undefined ? dueDate : updatedItemDueDate;
  const taskCategory = category || updatedItemCategory;

  if (!taskTitle) {
    return res.status(400).json({ error: "Task title cannot be empty" });
  }
  try {
    const result = await db.query(
      `UPDATE items SET title = $1, priority = $2, due_date = $3, category = $4 WHERE id = $5 AND user_id = $6 RETURNING ${taskFields}`,
      [taskTitle, taskPriority, taskDueDate || null, taskCategory, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to update task" });
  }
});

app.post("/edit", async (req, res) => {
  const { updatedItemTitle, updatedItemPriority = "medium", updatedItemDueDate = null, updatedItemCategory = "Personal" } = req.body;
  const id = req.body.updatedItemId;
  const taskTitle = (updatedItemTitle || "").trim();
  if (!taskTitle) {
    return wantsJson(req) ? res.status(400).json({ error: "Task title cannot be empty" }) : res.redirect("/");
  }
  try {
    const result = await db.query(`
      UPDATE items
      SET title = $1, priority = $2, due_date = $3, category = $4
      WHERE id = $5 AND user_id = $6 RETURNING ${taskFields}`, [taskTitle, updatedItemPriority, updatedItemDueDate || null, updatedItemCategory, id, req.user.id]);
    if (wantsJson(req)) {
      return res.json(result.rows[0]);
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    if (wantsJson(req)) {
      return res.status(500).json({ error: "Unable to edit task" });
    }
    res.status(500).send("Unable to edit task");
  }
});

// API & Form: Toggle Status
app.patch("/api/tasks/:id/status", async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE items SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING ${taskFields}`,
      [req.body.status, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to update task status" });
  }
});

app.post("/status", async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE items SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING ${taskFields}`,
      [req.body.status, req.body.id, req.user.id]
    );
    if (wantsJson(req)) {
      return res.json(result.rows[0]);
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    if (wantsJson(req)) {
      return res.status(500).json({ error: "Unable to update task status" });
    }
    res.status(500).send("Unable to update task status");
  }
});

// API & Form: Delete Task
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const result = await db.query("DELETE FROM items WHERE id = $1 AND user_id = $2 RETURNING id", [req.params.id, req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to delete task" });
  }
});

app.post("/delete", async (req, res) => {
  const id = req.body.deleteItemId;
  try {
    await db.query("DELETE FROM items WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    if (wantsJson(req)) {
      return res.json({ success: true, id });
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    if (wantsJson(req)) {
      return res.status(500).json({ error: "Unable to delete task" });
    }
    res.status(500).send("Unable to delete task");
  }
});

// ---------- Passport setup ----------

// Runs on POST /login: find the user by email and compare the password with the stored hash.
passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [username.trim().toLowerCase()]);
      if (result.rows.length === 0) {
        return cb(null, false);
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return cb(null, false);
      }
      return cb(null, { id: user.id, email: user.email });
    } catch (err) {
      return cb(err);
    }
  })
);

// Only the user id goes into the session cookie's server-side store.
passport.serializeUser((user, cb) => {
  cb(null, user.id);
});

// On every request, turn the stored id back into req.user.
passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT id, email FROM users WHERE id = $1", [id]);
    cb(null, result.rows[0] || false);
  } catch (err) {
    cb(err);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
