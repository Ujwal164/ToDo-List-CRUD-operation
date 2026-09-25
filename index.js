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

app.get("/", async (req, res) => {
  try {
    const result = await db.query(`SELECT ${taskFields} FROM items ORDER BY status DESC, due_date NULLS LAST, created_at DESC, id DESC`);
    const items = result.rows;
    const completed = items.filter((item) => item.status === "completed").length;
    const total = items.length;

    res.render("index.ejs", {
      listTitle: "Your tasks",
      listItems: items,
      stats: {
        total,
        completed,
        pending: total - completed,
        percentage: total ? Math.round((completed / total) * 100) : 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to load tasks");
  }
});

app.post("/add", async (req, res) => {
  const { newItem, priority = "medium", dueDate = null, category = "Personal" } = req.body;
  try {
    await db.query(
      "INSERT INTO items (title, priority, due_date, category) VALUES ($1, $2, $3, $4)",
      [newItem.trim(), priority, dueDate || null, category]
    );
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to add task");
  }
});

app.post("/edit", async (req, res) => {
  const { updatedItemTitle, updatedItemPriority = "medium", updatedItemDueDate = null, updatedItemCategory = "Personal" } = req.body;
  const id = req.body.updatedItemId;
  try {
    await db.query(`
      UPDATE items 
      SET title = $1, priority = $2, due_date = $3, category = $4
      WHERE id = $5`, [updatedItemTitle.trim(), updatedItemPriority, updatedItemDueDate || null, updatedItemCategory, id]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to edit task");
  }
});

app.post("/status", async (req, res) => {
  try {
    await db.query("UPDATE items SET status = $1 WHERE id = $2", [req.body.status, req.body.id]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to update task status");
  }
});

app.patch("/api/tasks/:id/status", async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE items SET status = $1 WHERE id = $2 RETURNING ${taskFields}`,
      [req.body.status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to update task status" });
  }
});

app.patch("/api/tasks/:id", async (req, res) => {
  const { title, priority, dueDate, category } = req.body;
  try {
    const result = await db.query(
      `UPDATE items SET title = $1, priority = $2, due_date = $3, category = $4 WHERE id = $5 RETURNING ${taskFields}`,
      [title.trim(), priority, dueDate || null, category, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to update task" });
  }
});

app.post("/delete", async (req, res) => {
  const id = req.body.deleteItemId;
  try {
    await db.query("DELETE FROM items WHERE id = $1", [id]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to delete task");
  }
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

