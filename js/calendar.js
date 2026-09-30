//캘린더 그리드 및 일정 색상 칩 스타일
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

/**
 * 주어진 연/월의 달력 그리드를 렌더링합니다.
 * @param {HTMLElement} gridEl - 그리드를 렌더링할 컨테이너
 * @param {number} year
 * @param {number} month - 0부터 시작 (0 = 1월)
 * @param {Array} events - [{ date: 'YYYY-MM-DD', time, title, color }]
 * @param {Function} [onDayClick] - 날짜를 한 번(드래그 없이) 클릭했을 때 실행할 콜백(dateKey) - 일정 추가용
 * @param {Function} [onRangeSelect] - 여러 날짜를 드래그로 선택했을 때 실행할 콜백(fromDateKey, toDateKey)
 * @param {Function} [onDayDoubleClick] - 날짜를 더블클릭했을 때 실행할 콜백(dateKey) - 일정 보기용
 */
export function renderCalendar(gridEl, year, month, events, onDayClick, onRangeSelect, onDayDoubleClick) {
  // 콜백은 매 렌더링(달 이동 등)마다 최신 걸로 갱신 - 드래그 이벤트 리스너는 아래에서 한 번만 연결됨
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
    const weekdayIndex = i % 7; // 0 = 일요일 ... 6 = 토요일
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

    const dayNumberEl = document.createElement("div");
    dayNumberEl.className = "day-number";
    dayNumberEl.textContent = dayNumber;

    if (!isOutside) {
      const holidayName = getHolidayName(dateKey);
      if (holidayName) {
        dayNumberEl.classList.add("holiday");
        dayNumberEl.title = holidayName;
      } else if (weekdayIndex === 0) {
        dayNumberEl.classList.add("sunday");
      } else if (weekdayIndex === 6) {
        dayNumberEl.classList.add("saturday");
      }
    }

    cellEl.appendChild(dayNumberEl);

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

/**
 * 캘린더 칸의 클릭/더블클릭/드래그를 처리합니다.
 * - 드래그 없이 한 번 클릭: onDayClick(dateKey) - 일정 추가
 * - 같은 칸을 빠르게 두 번 클릭: onDayDoubleClick(dateKey) - 그 날짜 일정 보기
 * - 드래그로 여러 칸 선택: onRangeSelect(fromDateKey, toDateKey) - 기간 일정 추가
 * gridEl은 달이 바뀌어도 재사용되는 같은 DOM 노드라서, 리스너는 한 번만 연결하고
 * 최신 콜백은 gridEl._onDayClick 등에서 매번 읽어옵니다.
 */
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
        // 같은 칸을 짧은 시간 안에 다시 클릭 -> 더블클릭으로 처리
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
