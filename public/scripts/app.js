const searchInput = document.getElementById("searchInput");
const taskCards = [...document.querySelectorAll(".task-card")];
const emptyState = document.getElementById("emptyState");
const visibleCount = document.getElementById("visibleCount");
let activeFilter = "all";
document.querySelector(".progress-fill").style.width = `${document.querySelector(".progress-fill").dataset.progress}%`;

function refreshTasks() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  taskCards.forEach((card) => {
    const matchesSearch = card.dataset.title.includes(query);
    const matchesFilter = activeFilter === "all" || card.dataset.status === activeFilter || card.dataset.priority === activeFilter;
    card.hidden = !(matchesSearch && matchesFilter);
    if (!card.hidden) visible += 1;
  });
  emptyState.hidden = visible !== 0;
  visibleCount.textContent = `${visible} task${visible === 1 ? "" : "s"}`;
}

searchInput.addEventListener("input", refreshTasks);
document.querySelectorAll(".filter-btn").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".filter-btn.active").classList.remove("active");
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    refreshTasks();
  });
});

document.querySelectorAll(".status-checkbox").forEach((checkbox) => {
  checkbox.addEventListener("change", async (event) => {
    const card = event.target.closest(".task-card");
    const status = event.target.checked ? "completed" : "pending";
    const response = await fetch(`/api/tasks/${card.dataset.taskId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (response.ok) {
      card.dataset.status = status;
      card.classList.toggle("is-completed", status === "completed");
      refreshTasks();
    } else {
      event.target.checked = !event.target.checked;
    }
  });
});

document.querySelectorAll(".edit-task").forEach((button) => {
  button.addEventListener("click", () => button.closest(".task-card").classList.add("editing"));
});

const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.getElementById("themeLabel");
themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("task-theme", nextTheme);
  themeLabel.textContent = nextTheme === "dark" ? "Light mode" : "Dark mode";
});

document.querySelectorAll(".due-date").forEach((dateElement) => {
  const dueDate = new Date(`${dateElement.dataset.dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dueDate < today) dateElement.classList.add("overdue");
  if (dueDate.getTime() === today.getTime()) dateElement.classList.add("today");
});

refreshTasks();