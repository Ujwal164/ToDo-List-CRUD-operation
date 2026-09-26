import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  // Local PostgreSQL usually has SSL disabled; enable it explicitly for hosted databases.
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});
db.connect().catch((err) => {
  console.error("Unable to connect to PostgreSQL:", err.message);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

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

app.get("/", async (req, res) => {
  try {
    const result = await db.query(`SELECT ${taskFields} FROM items ORDER BY status DESC, due_date NULLS LAST, created_at DESC, id DESC`);
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
    const result = await db.query(`SELECT ${taskFields} FROM items ORDER BY status DESC, due_date NULLS LAST, created_at DESC, id DESC`);
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
      `INSERT INTO items (title, priority, due_date, category) VALUES ($1, $2, $3, $4) RETURNING ${taskFields}`,
      [taskTitle, priority, dueDate || null, category]
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
      `INSERT INTO items (title, priority, due_date, category) VALUES ($1, $2, $3, $4) RETURNING ${taskFields}`,
      [taskTitle, priority, dueDate || null, category]
    );
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(201).json(result.rows[0]);
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
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
      `UPDATE items SET title = $1, priority = $2, due_date = $3, category = $4 WHERE id = $5 RETURNING ${taskFields}`,
      [taskTitle, taskPriority, taskDueDate || null, taskCategory, req.params.id]
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
  try {
    const result = await db.query(`
      UPDATE items 
      SET title = $1, priority = $2, due_date = $3, category = $4
      WHERE id = $5 RETURNING ${taskFields}`, [updatedItemTitle.trim(), updatedItemPriority, updatedItemDueDate || null, updatedItemCategory, id]);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json(result.rows[0]);
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ error: "Unable to edit task" });
    }
    res.status(500).send("Unable to edit task");
  }
});

// API & Form: Toggle Status
app.patch("/api/tasks/:id/status", async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE items SET status = $1 WHERE id = $2 RETURNING ${taskFields}`,
      [req.body.status, req.params.id]
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
    const result = await db.query(`UPDATE items SET status = $1 WHERE id = $2 RETURNING ${taskFields}`, [req.body.status, req.body.id]);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json(result.rows[0]);
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ error: "Unable to update task status" });
    }
    res.status(500).send("Unable to update task status");
  }
});

// API & Form: Delete Task
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const result = await db.query("DELETE FROM items WHERE id = $1 RETURNING id", [req.params.id]);
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
    await db.query("DELETE FROM items WHERE id = $1", [id]);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, id });
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ error: "Unable to delete task" });
    }
    res.status(500).send("Unable to delete task");
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

