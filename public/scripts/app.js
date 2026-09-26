/**
 * Taskflow - Reactive Client-Side Engine
 * Handles asynchronous CRUD, dynamic DOM updates, real-time stats, filtering, sorting, and UX interactions.
 */

(function () {
  'use strict';

  // --- DOM Elements Cache ---
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const categoryFilter = document.getElementById("categoryFilter");
  const priorityFilter = document.getElementById("priorityFilter");
  const sortSelector = document.getElementById("sortSelector");
  const filterChips = document.querySelectorAll(".filter-chip");
  const statCards = document.querySelectorAll(".stat-card[data-quick-filter]");
  const emptyState = document.getElementById("emptyState");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  const visibleCount = document.getElementById("visibleCount");
  const addTaskForm = document.getElementById("addTaskForm");
  const submitAddBtn = document.getElementById("submitAddBtn");
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeLabel");
  const toastHub = document.getElementById("toastHub");
  const pendingContainer = document.getElementById("pendingItemsContainer");
  const completedContainer = document.getElementById("completedItemsContainer");
  const pendingGroup = document.getElementById("pendingGroup");
  const completedGroup = document.getElementById("completedGroup");

  // State
  let activeStatusFilter = "all";
  let activeCategoryFilter = "all";
  let activePriorityFilter = "all";
  let activeSort = "default";

  // Category Icon Map
  const categoryIcons = {
    'Personal': '👤',
    'Work': '💼',
    'Study': '📚',
    'Shopping': '🛒',
    'Health': '💪',
    'Finance': '💰'
  };

  // --- Toast Notification System ---
  function showToast(message, type = "info") {
    if (!toastHub) return;
    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
      <button class="toast-close" type="button" aria-label="Dismiss">✕</button>
    `;

    toast.querySelector(".toast-close").addEventListener("click", () => {
      toast.classList.add("toast-hiding");
      setTimeout(() => toast.remove(), 250);
    });

    toastHub.appendChild(toast);

    // Auto dismiss after 3.5 seconds
    setTimeout(() => {
      if (toast.isConnected) {
        toast.classList.add("toast-hiding");
        setTimeout(() => toast.remove(), 250);
      }
    }, 3500);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Dynamic Greeting Initialization ---
  function initGreeting() {
    const greetingEl = document.getElementById("welcomeGreeting");
    const greetingIcon = document.getElementById("greetingIcon");
    if (!greetingEl) return;

    const hour = new Date().getHours();
    let greetingText = "Good day, let’s get things done.";
    let icon = "☀️";

    if (hour >= 5 && hour < 12) {
      greetingText = "Good morning, let’s achieve your goals.";
      icon = "🌅";
    } else if (hour >= 12 && hour < 17) {
      greetingText = "Good afternoon, keep the momentum going.";
      icon = "☀️";
    } else if (hour >= 17 && hour < 22) {
      greetingText = "Good evening, wrap up your day strong.";
      icon = "🌆";
    } else {
      greetingText = "Burning the midnight oil? Stay focused.";
      icon = "🌙";
    }

    greetingEl.textContent = greetingText;
    if (greetingIcon) greetingIcon.textContent = icon;
  }

  // --- Date Formatter Helper ---
  function formatDateBadge(dateStr) {
    if (!dateStr) return { text: "", isOverdue: false, isToday: false };
    try {
      const parts = dateStr.split("-");
      if (parts.length !== 3) return { text: dateStr, isOverdue: false, isToday: false };
      const due = new Date(parts[0], parts[1] - 1, parts[2]);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);

      const diffTime = due.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      let text = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      let isOverdue = diffDays < 0;
      let isToday = diffDays === 0;

      if (isToday) text = "Today";
      else if (diffDays === 1) text = "Tomorrow";
      else if (isOverdue) text = `${text} (Overdue)`;

      return { text, isOverdue, isToday };
    } catch (e) {
      return { text: dateStr, isOverdue: false, isToday: false };
    }
  }

  // --- Update Due Date Badges on All Cards ---
  function updateDueDateBadges() {
    document.querySelectorAll(".due-date-pill").forEach((pill) => {
      const rawDate = pill.dataset.dueDate;
      if (!rawDate) return;
      const { text, isOverdue, isToday } = formatDateBadge(rawDate);
      const textEl = pill.querySelector(".due-text");
      if (textEl) textEl.textContent = text;
      pill.classList.toggle("is-overdue", isOverdue);
      pill.classList.toggle("is-today", isToday);
    });
  }

  // --- Live Dynamic Statistics Calculation ---
  function updateAllStats() {
    const allCards = [...document.querySelectorAll(".task-card")];
    const total = allCards.length;
    const completed = allCards.filter(c => c.dataset.status === "completed").length;
    const pending = total - completed;
    const percentage = total ? Math.round((completed / total) * 100) : 0;

    // Stat Cards
    const statTotal = document.getElementById("statTotal");
    const statCompleted = document.getElementById("statCompleted");
    const statPending = document.getElementById("statPending");
    const statPercentage = document.getElementById("statPercentage");
    if (statTotal) statTotal.textContent = total;
    if (statCompleted) statCompleted.textContent = completed;
    if (statPending) statPending.textContent = pending;
    if (statPercentage) statPercentage.textContent = `${percentage}%`;

    // Filter Chips
    const countAll = document.getElementById("filterCountAll");
    const countPending = document.getElementById("filterCountPending");
    const countCompleted = document.getElementById("filterCountCompleted");
    if (countAll) countAll.textContent = total;
    if (countPending) countPending.textContent = pending;
    if (countCompleted) countCompleted.textContent = completed;

    // Section headers
    const pendingCountEl = document.getElementById("pendingGroupCount");
    const completedCountEl = document.getElementById("completedGroupCount");
    if (pendingCountEl) pendingCountEl.textContent = pending;
    if (completedCountEl) completedCountEl.textContent = completed;

    // Hero pending count
    const heroCount = document.getElementById("heroPendingCount");
    if (heroCount) heroCount.textContent = pending;

    // Progress Bar
    const progressFill = document.getElementById("progressBarFill");
    const progressFraction = document.getElementById("progressFraction");
    const progressPill = document.getElementById("progressPercentagePill");
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
      progressFill.dataset.progress = percentage;
    }
    if (progressFraction) {
      progressFraction.innerHTML = `<strong>${completed}</strong> / ${total} completed`;
    }
    if (progressPill) {
      progressPill.textContent = `${percentage}%`;
    }

    // Dynamic greeting subtext
    const welcomeSubtext = document.getElementById("welcomeSubtext");
    if (welcomeSubtext) {
      if (total === 0) {
        welcomeSubtext.textContent = "Your workspace is clear. Add a task to get started!";
      } else if (pending === 0) {
        welcomeSubtext.textContent = "✨ All tasks are completed! Enjoy your day.";
      } else {
        welcomeSubtext.innerHTML = `You have <strong id="heroPendingCount">${pending}</strong> task${pending === 1 ? '' : 's'} pending. Stay focused and keep momentum.`;
      }
    }
  }

  // --- Filtering & Sorting ---
  function applyFiltersAndSort() {
    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
    const allCards = [...document.querySelectorAll(".task-card")];

    // Toggle clear search button
    if (clearSearchBtn) {
      clearSearchBtn.hidden = !query;
    }

    let visibleCountTotal = 0;
    let visiblePending = 0;
    let visibleCompleted = 0;

    allCards.forEach((card) => {
      const cardTitle = (card.dataset.title || "").toLowerCase();
      const cardStatus = card.dataset.status || "pending";
      const cardPriority = card.dataset.priority || "medium";
      const cardCategory = card.dataset.category || "Personal";

      // Search match
      const matchesSearch = !query ||
        cardTitle.includes(query) ||
        cardCategory.toLowerCase().includes(query) ||
        cardPriority.toLowerCase().includes(query);

      // Status filter match
      const matchesStatus = activeStatusFilter === "all" || cardStatus === activeStatusFilter;

      // Category filter match
      const matchesCategory = activeCategoryFilter === "all" || cardCategory.toLowerCase() === activeCategoryFilter.toLowerCase();

      // Priority filter match
      const matchesPriority = activePriorityFilter === "all" || cardPriority.toLowerCase() === activePriorityFilter.toLowerCase();

      const isVisible = matchesSearch && matchesStatus && matchesCategory && matchesPriority;
      card.hidden = !isVisible;

      if (isVisible) {
        visibleCountTotal++;
        if (cardStatus === "completed") visibleCompleted++;
        else visiblePending++;
      }
    });

    // Update section group visibility if needed
    if (pendingGroup) {
      pendingGroup.style.display = (visiblePending === 0 && (activeStatusFilter === "completed" || visibleCountTotal === 0)) ? "none" : "block";
    }
    if (completedGroup) {
      completedGroup.style.display = (visibleCompleted === 0 && (activeStatusFilter === "pending" || visibleCountTotal === 0)) ? "none" : "block";
    }

    // Empty state
    if (emptyState) {
      emptyState.hidden = visibleCountTotal !== 0;
    }

    // Counter badge
    if (visibleCount) {
      visibleCount.textContent = `${visibleCountTotal} task${visibleCountTotal === 1 ? "" : "s"}`;
    }

    // Apply Sorting within containers
    sortCardList(pendingContainer);
    sortCardList(completedContainer);
  }

  function sortCardList(container) {
    if (!container) return;
    const cards = [...container.querySelectorAll(".task-card")];
    if (cards.length <= 1) return;

    cards.sort((a, b) => {
      if (activeSort === "title-asc") {
        return (a.dataset.title || "").localeCompare(b.dataset.title || "");
      }
      if (activeSort === "priority-desc") {
        const weights = { high: 3, medium: 2, low: 1 };
        return (weights[b.dataset.priority] || 0) - (weights[a.dataset.priority] || 0);
      }
      if (activeSort === "date-asc") {
        const dateA = a.dataset.dueDate || "9999-99-99";
        const dateB = b.dataset.dueDate || "9999-99-99";
        return dateA.localeCompare(dateB);
      }
      if (activeSort === "date-desc") {
        const dateA = a.dataset.dueDate || "0000-00-00";
        const dateB = b.dataset.dueDate || "0000-00-00";
        return dateB.localeCompare(dateA);
      }
      return 0; // Default DOM order
    });

    cards.forEach(card => container.appendChild(card));
  }

  // --- Create Task Card HTML Element Dynamically ---
  function createTaskCardElement(task) {
    const isCompleted = task.status === "completed";
    const rawDate = task.due_date ? (task.due_date.slice ? task.due_date.slice(0, 10) : String(task.due_date).slice(0, 10)) : "";
    const { text: formattedDate, isOverdue, isToday } = formatDateBadge(rawDate);
    const catIcon = categoryIcons[task.category] || "📌";

    const article = document.createElement("article");
    article.className = `task-card ${isCompleted ? 'is-completed' : ''} task-item-enter`;
    article.id = `task-${task.id}`;
    article.dataset.taskId = task.id;
    article.dataset.title = (task.title || "").toLowerCase();
    article.dataset.status = task.status || "pending";
    article.dataset.priority = task.priority || "medium";
    article.dataset.category = task.category || "Personal";
    article.dataset.dueDate = rawDate;

    article.innerHTML = `
      <div class="task-view-mode">
        <label class="custom-checkbox-wrap" title="${isCompleted ? 'Mark as pending' : 'Mark as completed'}">
          <input class="status-checkbox" type="checkbox" ${isCompleted ? 'checked' : ''} aria-label="Toggle task status">
          <span class="custom-checkmark">
            <svg class="check-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </label>

        <div class="task-body">
          <div class="task-header-line">
            <h3 class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</h3>
            <span class="priority-pill priority-${task.priority}">
              <span class="priority-dot"></span>
              ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </span>
          </div>

          <div class="task-meta-row">
            <span class="category-pill category-${task.category.toLowerCase()}">
              <span class="cat-icon">${catIcon}</span>
              ${task.category}
            </span>

            ${rawDate ? `
              <span class="due-date-pill ${isOverdue ? 'is-overdue' : ''} ${isToday ? 'is-today' : ''}" data-due-date="${rawDate}" title="Due date: ${rawDate}">
                <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span class="due-text">${formattedDate}</span>
              </span>
            ` : ''}
          </div>
        </div>

        <div class="task-actions-group">
          <button class="action-btn edit-task-btn" type="button" aria-label="Edit task" title="Edit task">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>

          <button class="action-btn delete-task-btn" type="button" aria-label="Delete task" title="Delete task">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>

      <form class="inline-edit-form" action="/edit" method="post">
        <input type="hidden" name="updatedItemId" value="${task.id}">
        <div class="edit-fields-grid">
          <div class="edit-field full-width">
            <label class="edit-label">Task Title</label>
            <input class="edit-input-title" name="updatedItemTitle" value="${escapeHtml(task.title)}" required placeholder="What needs to be done?">
          </div>
          
          <div class="edit-field">
            <label class="edit-label">Priority</label>
            <select class="edit-select" name="updatedItemPriority">
              <option value="high" ${task.priority === 'high' ? 'selected' : ''}>🔴 High</option>
              <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>🟡 Medium</option>
              <option value="low" ${task.priority === 'low' ? 'selected' : ''}>🟢 Low</option>
            </select>
          </div>

          <div class="edit-field">
            <label class="edit-label">Due Date</label>
            <input class="edit-date" type="date" name="updatedItemDueDate" value="${rawDate}">
          </div>

          <div class="edit-field">
            <label class="edit-label">Category</label>
            <select class="edit-select" name="updatedItemCategory">
              ${['Personal', 'Work', 'Study', 'Shopping', 'Health', 'Finance'].map(cat => `
                <option value="${cat}" ${task.category === cat ? 'selected' : ''}>${cat}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="edit-actions-row">
          <button type="button" class="cancel-edit-btn">Cancel</button>
          <button type="submit" class="save-edit-btn">
            <span class="save-btn-text">Save Changes</span>
          </button>
        </div>
      </form>
    `;

    return article;
  }

  // --- Async Handler: Add Task ---
  if (addTaskForm) {
    addTaskForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById("newItem");
      const prioritySelect = document.getElementById("newPriority");
      const dueDateInput = document.getElementById("newDueDate");
      const categorySelect = document.getElementById("newCategory");

      const title = titleInput.value.trim();
      if (!title) return;

      const priority = prioritySelect.value || "medium";
      const dueDate = dueDateInput.value || null;
      const category = categorySelect.value || "Personal";

      // Loading state
      if (submitAddBtn) {
        submitAddBtn.disabled = true;
        submitAddBtn.classList.add("is-loading");
      }

      try {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ title, priority, dueDate, category }),
        });

        if (!response.ok) {
          throw new Error("Server failed to create task");
        }

        const createdTask = await response.json();

        // Build DOM element and prepend to pending list
        const newCard = createTaskCardElement(createdTask);
        if (pendingContainer) {
          pendingContainer.prepend(newCard);
        }

        // Reset form
        titleInput.value = "";
        dueDateInput.value = "";
        prioritySelect.value = "medium";
        categorySelect.value = "Personal";
        titleInput.focus();

        // Update stats and filters
        updateAllStats();
        updateDueDateBadges();
        applyFiltersAndSort();

        showToast(`Task "${createdTask.title}" added!`, "success");
      } catch (err) {
        console.error("Error adding task:", err);
        showToast("Failed to create task. Please try again.", "error");
      } finally {
        if (submitAddBtn) {
          submitAddBtn.disabled = false;
          submitAddBtn.classList.remove("is-loading");
        }
      }
    });
  }

  // --- Global Event Delegation for Task Card Interactions ---
  document.addEventListener("change", async (e) => {
    // 1. Status Checkbox Toggle
    if (e.target.matches(".status-checkbox")) {
      const checkbox = e.target;
      const card = checkbox.closest(".task-card");
      if (!card) return;

      const taskId = card.dataset.taskId;
      const newStatus = checkbox.checked ? "completed" : "pending";
      const prevStatus = card.dataset.status;

      // Optimistic UI state
      card.dataset.status = newStatus;
      card.classList.toggle("is-completed", newStatus === "completed");

      try {
        const response = await fetch(`/api/tasks/${taskId}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!response.ok) {
          throw new Error("Status update failed");
        }

        // Animate card movement between pending & completed groups
        card.classList.add("task-item-move");
        setTimeout(() => {
          if (newStatus === "completed" && completedContainer) {
            completedContainer.prepend(card);
          } else if (newStatus === "pending" && pendingContainer) {
            pendingContainer.prepend(card);
          }
          card.classList.remove("task-item-move");
          updateAllStats();
          applyFiltersAndSort();
        }, 150);

        showToast(
          newStatus === "completed" ? "Task marked completed! 🎉" : "Task moved to pending ⏳",
          "success"
        );
      } catch (err) {
        console.error("Error updating status:", err);
        // Revert UI
        checkbox.checked = prevStatus === "completed";
        card.dataset.status = prevStatus;
        card.classList.toggle("is-completed", prevStatus === "completed");
        showToast("Failed to update status.", "error");
      }
    }
  });

  document.addEventListener("click", async (e) => {
    // 2. Edit Button Click
    const editBtn = e.target.closest(".edit-task-btn");
    if (editBtn) {
      const card = editBtn.closest(".task-card");
      if (card) {
        // Close any other open edit forms
        document.querySelectorAll(".task-card.is-editing").forEach(c => {
          if (c !== card) c.classList.remove("is-editing");
        });
        card.classList.toggle("is-editing");
        if (card.classList.contains("is-editing")) {
          const titleInput = card.querySelector(".edit-input-title");
          if (titleInput) {
            titleInput.focus();
            titleInput.select();
          }
        }
      }
      return;
    }

    // 3. Cancel Edit Button Click
    const cancelBtn = e.target.closest(".cancel-edit-btn");
    if (cancelBtn) {
      const card = cancelBtn.closest(".task-card");
      if (card) {
        card.classList.remove("is-editing");
      }
      return;
    }

    // 4. Delete Task Button Click
    const deleteBtn = e.target.closest(".delete-task-btn");
    if (deleteBtn) {
      const card = deleteBtn.closest(".task-card");
      if (!card) return;

      const taskId = card.dataset.taskId;
      const title = card.querySelector(".task-title")?.textContent || "Task";

      // Animate out
      card.classList.add("task-item-delete");

      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: "DELETE",
          headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
          throw new Error("Failed to delete task");
        }

        setTimeout(() => {
          card.remove();
          updateAllStats();
          applyFiltersAndSort();
          showToast(`Deleted "${title}"`, "info");
        }, 220);
      } catch (err) {
        console.error("Error deleting task:", err);
        card.classList.remove("task-item-delete");
        showToast("Unable to delete task. Please try again.", "error");
      }
      return;
    }

    // 5. Quick Filter Click on Stat Cards
    const quickStatCard = e.target.closest(".stat-card[data-quick-filter]");
    if (quickStatCard) {
      const targetFilter = quickStatCard.dataset.quickFilter;
      filterChips.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.filter === targetFilter);
      });
      activeStatusFilter = targetFilter;
      applyFiltersAndSort();
    }
  });

  // --- Inline Edit Form Submit Handler ---
  document.addEventListener("submit", async (e) => {
    if (e.target.matches(".inline-edit-form")) {
      e.preventDefault();
      const form = e.target;
      const card = form.closest(".task-card");
      if (!card) return;

      const taskId = card.dataset.taskId;
      const titleInput = form.querySelector('input[name="updatedItemTitle"]');
      const prioritySelect = form.querySelector('select[name="updatedItemPriority"]');
      const dueDateInput = form.querySelector('input[name="updatedItemDueDate"]');
      const categorySelect = form.querySelector('select[name="updatedItemCategory"]');

      const title = titleInput.value.trim();
      if (!title) return;

      const priority = prioritySelect.value;
      const dueDate = dueDateInput.value || null;
      const category = categorySelect.value;

      const saveBtn = form.querySelector(".save-edit-btn");
      if (saveBtn) saveBtn.disabled = true;

      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ title, priority, dueDate, category }),
        });

        if (!response.ok) {
          throw new Error("Failed to update task");
        }

        const updated = await response.json();

        // Update dataset
        const rawDate = updated.due_date ? (updated.due_date.slice ? updated.due_date.slice(0, 10) : String(updated.due_date).slice(0, 10)) : "";
        card.dataset.title = (updated.title || "").toLowerCase();
        card.dataset.priority = updated.priority;
        card.dataset.category = updated.category;
        card.dataset.dueDate = rawDate;

        // Update DOM elements inside card
        const titleEl = card.querySelector(".task-title");
        if (titleEl) {
          titleEl.textContent = updated.title;
          titleEl.title = updated.title;
        }

        const priorityPill = card.querySelector(".priority-pill");
        if (priorityPill) {
          priorityPill.className = `priority-pill priority-${updated.priority}`;
          priorityPill.innerHTML = `<span class="priority-dot"></span> ${updated.priority.charAt(0).toUpperCase() + updated.priority.slice(1)}`;
        }

        const catPill = card.querySelector(".category-pill");
        if (catPill) {
          const catIcon = categoryIcons[updated.category] || "📌";
          catPill.className = `category-pill category-${updated.category.toLowerCase()}`;
          catPill.innerHTML = `<span class="cat-icon">${catIcon}</span> ${updated.category}`;
        }

        const metaRow = card.querySelector(".task-meta-row");
        let duePill = card.querySelector(".due-date-pill");
        if (rawDate) {
          const { text: formattedDate, isOverdue, isToday } = formatDateBadge(rawDate);
          if (duePill) {
            duePill.dataset.dueDate = rawDate;
            duePill.className = `due-date-pill ${isOverdue ? 'is-overdue' : ''} ${isToday ? 'is-today' : ''}`;
            const textEl = duePill.querySelector(".due-text");
            if (textEl) textEl.textContent = formattedDate;
          } else if (metaRow) {
            const span = document.createElement("span");
            span.className = `due-date-pill ${isOverdue ? 'is-overdue' : ''} ${isToday ? 'is-today' : ''}`;
            span.dataset.dueDate = rawDate;
            span.title = `Due date: ${rawDate}`;
            span.innerHTML = `
              <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span class="due-text">${formattedDate}</span>
            `;
            metaRow.appendChild(span);
          }
        } else if (duePill) {
          duePill.remove();
        }

        // Close drawer
        card.classList.remove("is-editing");
        applyFiltersAndSort();
        showToast("Task updated successfully! ✏️", "success");
      } catch (err) {
        console.error("Error editing task:", err);
        showToast("Failed to save edits.", "error");
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    }
  });

  // --- Search & Filter Listeners ---
  if (searchInput) {
    searchInput.addEventListener("input", applyFiltersAndSort);
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      searchInput.focus();
      applyFiltersAndSort();
    });
  }

  filterChips.forEach((button) => {
    button.addEventListener("click", () => {
      filterChips.forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      activeStatusFilter = button.dataset.filter;
      applyFiltersAndSort();
    });
  });

  if (categoryFilter) {
    categoryFilter.addEventListener("change", () => {
      activeCategoryFilter = categoryFilter.value;
      applyFiltersAndSort();
    });
  }

  if (priorityFilter) {
    priorityFilter.addEventListener("change", () => {
      activePriorityFilter = priorityFilter.value;
      applyFiltersAndSort();
    });
  }

  if (sortSelector) {
    sortSelector.addEventListener("change", () => {
      activeSort = sortSelector.value;
      applyFiltersAndSort();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (categoryFilter) categoryFilter.value = "all";
      if (priorityFilter) priorityFilter.value = "all";
      if (sortSelector) sortSelector.value = "default";
      filterChips.forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));

      activeStatusFilter = "all";
      activeCategoryFilter = "all";
      activePriorityFilter = "all";
      activeSort = "default";

      applyFiltersAndSort();
    });
  }

  // --- Quick Date Chips in Add Form ---
  document.querySelectorAll(".quick-date-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.date;
      const dateInput = document.getElementById("newDueDate");
      if (!dateInput) return;

      const targetDate = new Date();
      if (type === "tomorrow") {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (type === "next-week") {
        targetDate.setDate(targetDate.getDate() + 7);
      }

      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
      const dd = String(targetDate.getDate()).padStart(2, "0");
      dateInput.value = `${yyyy}-${mm}-${dd}`;
    });
  });

  // --- Theme Toggle ---
  function updateThemeUI(theme) {
    document.documentElement.dataset.theme = theme;
    if (themeLabel) {
      themeLabel.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const currentTheme = document.documentElement.dataset.theme || "light";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      updateThemeUI(nextTheme);
      localStorage.setItem("taskflow-theme", nextTheme);
      localStorage.setItem("task-theme", nextTheme);
    });
  }

  // --- Keyboard Shortcuts ---
  document.addEventListener("keydown", (e) => {
    // If typing inside an input/textarea/select, don't trigger global shortcuts except Escape
    const isTyping = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);

    if (e.key === "Escape") {
      // Close open edit drawers
      document.querySelectorAll(".task-card.is-editing").forEach(c => c.classList.remove("is-editing"));
      // Clear search if focused
      if (document.activeElement === searchInput && searchInput.value) {
        searchInput.value = "";
        applyFiltersAndSort();
      }
    } else if (!isTyping) {
      if (e.key === "/" && searchInput) {
        e.preventDefault();
        searchInput.focus();
      } else if ((e.key === "n" || e.key === "N")) {
        const titleInput = document.getElementById("newItem");
        if (titleInput) {
          e.preventDefault();
          titleInput.focus();
        }
      }
    }
  });

  // --- Initial Page Load Setup ---
  initGreeting();
  updateDueDateBadges();
  updateAllStats();
  applyFiltersAndSort();

  const initialTheme = document.documentElement.dataset.theme || "light";
  updateThemeUI(initialTheme);

})();