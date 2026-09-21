//캘린더 그리드 및 일정 색상 칩 스타일
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const COLOR_CLASS = {
  red: "color-red",
  yellow: "color-yellow",
  green: "color-green",
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
 * @param {Function} onDayClick - 날짜 클릭 시 실행할 콜백(dateKey)
 */
export function renderCalendar(gridEl, year, month, events, onDayClick) {
  gridEl.innerHTML = "";

  WEEKDAY_LABELS.forEach((label) => {
    const weekdayEl = document.createElement("div");
    weekdayEl.className = "weekday";
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
    cellEl.appendChild(dayNumberEl);

    const dayEvents = eventsByDate[dateKey] || [];
    dayEvents.forEach((event) => {
      const chipEl = document.createElement("div");
      chipEl.className = `event-chip ${getColorClass(event.color)}`;
      const label = event.time ? `${event.time} (${event.title})` : event.title;
      chipEl.textContent = label;
      cellEl.appendChild(chipEl);
    });

    cellEl.addEventListener("click", () => {
      if (onDayClick) onDayClick(dateKey);
    });

    gridEl.appendChild(cellEl);
  }
}

function groupEventsByDate(events) {
  return events.reduce((acc, event) => {
    if (!acc[event.date]) acc[event.date] = [];
    acc[event.date].push(event);
    return acc;
  }, {});
}