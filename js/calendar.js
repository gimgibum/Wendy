// 달력 그리기
import { getHolidayName } from "./holidays.js";

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const COLOR_CLASS = {
  red: "color-red",
  orange: "color-orange",
  yellow: "color-yellow",
  green: "color-green",
  teal: "color-teal",
  blue: "color-blue",
  purple: "color-purple",
  pink: "color-pink",
  brown: "color-brown",
  gray: "color-gray",
};

export function getColorClass(color) {
  return COLOR_CLASS[color] || "color-red";
}

function toDateKey(year, month, day) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// 달력 렌더링
export function renderCalendar(gridEl, year, month, events, onDayClick, onRangeSelect, onDayDoubleClick) {
  gridEl._onDayClick = onDayClick;
  gridEl._onRangeSelect = onRangeSelect;
  gridEl._onDayDoubleClick = onDayDoubleClick;
  wireDragSelection(gridEl);

  gridEl.innerHTML = "";

  WEEKDAY_LABELS.forEach((label, index) => {
    const weekdayEl = document.createElement("div");
    weekdayEl.className = "weekday";
    if (index === 0) weekdayEl.classList.add("sunday");
    if (index === 6) weekdayEl.classList.add("saturday");
    weekdayEl.textContent = label;
    gridEl.appendChild(weekdayEl);
  });
   const eventsByDate = groupEventsByDate(events);

  const firstDayOfMonth = new Date(year, month, 1);
  const startOffset = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const todayKey = toDateKey(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  );

  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - startOffset;
    const weekdayIndex = i % 7;
    let cellYear = year;
    let cellMonth = month;
    let dayNumber;
    let isOutside = false;

    if (dayOffset < 0) {
      dayNumber = daysInPrevMonth + dayOffset + 1;
      cellMonth = month - 1;
      isOutside = true;
    } else if (dayOffset >= daysInMonth) {
      dayNumber = dayOffset - daysInMonth + 1;
      cellMonth = month + 1;
      isOutside = true;
    } else {
      dayNumber = dayOffset + 1;
    }
        if (cellMonth < 0) {
      cellMonth = 11;
      cellYear = year - 1;
    } else if (cellMonth > 11) {
      cellMonth = 0;
      cellYear = year + 1;
    }

    const dateKey = toDateKey(cellYear, cellMonth, dayNumber);

    const cellEl = document.createElement("div");
    cellEl.className = "calendar-cell";
    if (isOutside) cellEl.classList.add("outside");
    if (dateKey === todayKey) cellEl.classList.add("today");
    cellEl.dataset.date = dateKey;

    const dayHeaderEl = document.createElement("div");
    dayHeaderEl.className = "day-header";

    const dayNumberEl = document.createElement("div");
    dayNumberEl.className = "day-number";
    dayNumberEl.textContent = dayNumber;
    dayHeaderEl.appendChild(dayNumberEl);

    if (!isOutside) {
      const holidayName = getHolidayName(dateKey);
      if (holidayName) {
        dayNumberEl.classList.add("holiday");
        cellEl.classList.add("holiday");

        const holidayNameEl = document.createElement("span");
        holidayNameEl.className = "holiday-name";
        holidayNameEl.textContent = holidayName;
        holidayNameEl.title = holidayName;
        dayHeaderEl.appendChild(holidayNameEl);
      } else if (weekdayIndex === 0) {
        dayNumberEl.classList.add("sunday");
      } else if (weekdayIndex === 6) {
        dayNumberEl.classList.add("saturday");
      }
    }

    cellEl.appendChild(dayHeaderEl);

    const dayEvents = eventsByDate[dateKey] || [];
    dayEvents.forEach((event) => {
      const chipEl = document.createElement("div");
      chipEl.className = `event-chip ${getColorClass(event.color)}`;
      const label = event.time ? `${event.time} (${event.title})` : event.title;
      chipEl.textContent = label;
      cellEl.appendChild(chipEl);
    });

    gridEl.appendChild(cellEl);
  }
}

// 클릭, 더블클릭, 드래그 선택
function wireDragSelection(gridEl) {
  if (gridEl._dragWired) return;
  gridEl._dragWired = true;

  const DBLCLICK_DELAY = 280;
  let dragStart = null;
  let dragEnd = null;
  let isDragging = false;
  let pendingClickTimer = null;
  let pendingClickDate = null;

  function clearSelectionStyle() {
    gridEl.querySelectorAll(".calendar-cell.selecting").forEach((el) => el.classList.remove("selecting"));
  }

  function applySelectionStyle(a, b) {
    clearSelectionStyle();
    const from = a < b ? a : b;
    const to = a < b ? b : a;
    gridEl.querySelectorAll(".calendar-cell").forEach((el) => {
      const d = el.dataset.date;
      if (d >= from && d <= to) el.classList.add("selecting");
    });
  }

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".calendar-cell") : null;
  }

  function startDrag(cell) {
    if (!cell) return;
    isDragging = true;
    dragStart = cell.dataset.date;
    dragEnd = dragStart;
    applySelectionStyle(dragStart, dragEnd);
  }

  function moveDrag(cell) {
    if (!isDragging || !cell) return;
    dragEnd = cell.dataset.date;
    applySelectionStyle(dragStart, dragEnd);
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    clearSelectionStyle();
    if (!dragStart) return;
    if (dragStart === dragEnd) {
      if (pendingClickTimer && pendingClickDate === dragStart) {
        clearTimeout(pendingClickTimer);
        pendingClickTimer = null;
        pendingClickDate = null;
        if (gridEl._onDayDoubleClick) gridEl._onDayDoubleClick(dragStart);
      } else {
        if (pendingClickTimer) clearTimeout(pendingClickTimer);
        pendingClickDate = dragStart;
        const clickedDate = dragStart;
        pendingClickTimer = setTimeout(() => {
          pendingClickTimer = null;
          pendingClickDate = null;
          if (gridEl._onDayClick) gridEl._onDayClick(clickedDate);
        }, DBLCLICK_DELAY);
      }
    } else if (gridEl._onRangeSelect) {
      const from = dragStart < dragEnd ? dragStart : dragEnd;
      const to = dragStart < dragEnd ? dragEnd : dragStart;
      gridEl._onRangeSelect(from, to);
    }
    dragStart = null;
    dragEnd = null;
  }

  gridEl.addEventListener("mousedown", (event) => {
    const cell = event.target.closest(".calendar-cell");
    if (!cell) return;
    startDrag(cell);
    event.preventDefault();
  });
  gridEl.addEventListener("mouseover", (event) => {
    moveDrag(event.target.closest(".calendar-cell"));
  });
  window.addEventListener("mouseup", endDrag);

  gridEl.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      startDrag(cellFromPoint(touch.clientX, touch.clientY));
    },
    { passive: true },
  );
  gridEl.addEventListener(
    "touchmove",
    (event) => {
      if (!isDragging) return;
      const touch = event.touches[0];
      moveDrag(cellFromPoint(touch.clientX, touch.clientY));
      event.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener("touchend", endDrag);
}

function groupEventsByDate(events) {
  return events.reduce((acc, event) => {
    if (!acc[event.date]) acc[event.date] = [];
    acc[event.date].push(event);
    return acc;
  }, {});
}
