const START_HOUR = 8;
const END_HOUR = 20;
const DAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const DAY_PATTERN = "(Po|Út|St|Čt|Pá|So|Ne|Pondělí|Úterý|Středa|Čtvrtek|Pátek)";
const COURSE_COLORS_KEY = "rozvrh-course-colors";
const COURSES_STORAGE_KEY = "rozvrh-github-courses";

function loadCourseColors() {
  const stored = localStorage.getItem(COURSE_COLORS_KEY);
  if (!stored) return {};
  try {
    const colors = JSON.parse(stored);
    if (!colors || typeof colors !== "object" || Array.isArray(colors)) return {};
    return Object.fromEntries(
      Object.entries(colors).filter(([, color]) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color)),
    );
  } catch (error) {
    console.error("Uložené barvy předmětů se nepodařilo načíst.", error);
    return {};
  }
}

const state = {
  courses: [],
  selectedGroups: {},
  expandedGroups: {},
  collapsedCourses: {},
  courseColors: loadCourseColors(),
  weekStart: mondayOf(new Date()),
  semesterStart: null,
};
let eventPopover;
let lastCoursesSnapshot;
let activeColorCourse;

const elements = {
  status: document.querySelector("#sync-status"),
  courseList: document.querySelector("#course-list"),
  courseCount: document.querySelector("#course-count"),
  emptyState: document.querySelector("#empty-state"),
  calendar: document.querySelector("#calendar"),
  calendarEmpty: document.querySelector("#calendar-empty"),
  timeLabels: document.querySelector("#time-labels"),
  weekTitle: document.querySelector("#week-title"),
  weekParity: document.querySelector("#week-parity"),
  colorDialog: document.querySelector("#color-picker-dialog"),
  colorDialogCourse: document.querySelector("#color-picker-course"),
  colorDialogInput: document.querySelector("#color-picker-input"),
  colorDialogValue: document.querySelector("#color-picker-value"),
  colorDialogUnique: document.querySelector("#color-picker-unique"),
  coursesFile: document.querySelector("#courses-file"),
  importFileButton: document.querySelector("#import-file-button"),
  clearDataButton: document.querySelector("#clear-data-button"),
};

function mondayOf(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—]\s*informace o předmětu\s*$/iu, "")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractInstructors(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => line.toLocaleLowerCase("cs-CZ").startsWith("vyučující"));
  if (start < 0) return [];
  const nextHeading = /^(?:Garance|Rozvrh|Předpoklady|Omezení zápisu|Mateřské obory|Anotace|Výstupy|Klíčová témata|Studijní zdroje)\b/i;
  const names = [];
  for (const line of lines.slice(start + 1)) {
    if (nextHeading.test(line)) break;
    if (/^(?:Rozvrh|Garance)\b/i.test(line)) break;
    if (/(?:^|\s)(?:Mgr\.|Ing\.|Bc\.|doc\.|prof\.|RNDr\.|Ph\.D\.)/i.test(line)) {
      names.push(line.replace(/^[•·-]\s*/, ""));
    }
  }
  return [...new Set(names)];
}

function extractGroupInstructors(text, fallbackInstructors) {
  const timePattern = new RegExp(
    `${DAY_PATTERN}\\.?\\s+(?:(\\d{1,2})\\.\\s*(\\d{1,2})\\.(?:\\s*(\\d{4}))?\\s+)?(\\d{1,2}):(\\d{2})\\s*[-–]\\s*(\\d{1,2}):(\\d{2})`,
    "giu",
  );
  const matches = [...text.matchAll(timePattern)];
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch) return fallbackInstructors;
  const suffix = text.slice((lastMatch.index || 0) + lastMatch[0].length);
  const named = [...suffix.matchAll(
    /((?:(?:Mgr|Ing|Bc|doc|prof|RNDr|MUDr|PhDr|JUDr|PaedDr|Ph\.D)\.\s*)+[^\n,;]+|(?:[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]\.\s*)+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\p{L}'’\-]+(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\p{L}'’\-]+){0,2})/gu,
  )].map((match) => match[1].trim()).filter(Boolean);
  const groupInstructors = [...new Set(named)];
  return groupInstructors.length ? groupInstructors : fallbackInstructors;
}

function findYear(month, day) {
  const now = new Date();
  const candidates = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  return candidates
    .map((year) => {
      const date = new Date(year, month - 1, day);
      return { year, distance: Math.abs(date.getTime() - now.getTime()) };
    })
    .sort((a, b) => a.distance - b.distance)[0].year;
}

function parseOccurrences(text, instructors) {
  const pattern = new RegExp(
    `${DAY_PATTERN}\\.?\\s+(?:(\\d{1,2})\\.\\s*(\\d{1,2})\\.(?:\\s*(\\d{4}))?\\s+)?(\\d{1,2}):(\\d{2})\\s*[-–]\\s*(\\d{1,2}):(\\d{2})`,
    "giu",
  );
  const matches = [...text.matchAll(pattern)];
  return matches.map((match, index) => {
    const weekdayName = match[1].toLocaleLowerCase("cs-CZ");
    const weekday = weekdayName.startsWith("po") ? 0
      : weekdayName.startsWith("út") || weekdayName.startsWith("úte") ? 1
        : weekdayName.startsWith("st") ? 2
          : weekdayName.startsWith("čt") || weekdayName.startsWith("čtv") ? 3
            : weekdayName.startsWith("pá") || weekdayName.startsWith("pát") ? 4 : 5;
    const [, , dayText, monthText, yearText, startHour, startMinute, endHour, endMinute] = match;
    const after = text.slice((match.index || 0) + match[0].length, matches[index + 1]?.index ?? text.length);
    const roomMatch = /\b[A-Z]{1,3}\d{1,3}(?:\/\d{2,5}|,\d{3,5})\b(?:\s+(?:aula|posluchárna|laboratoř|laborator|učebna))?/iu.exec(after);
    const namedLocationMatch = /\b(?:posilovna(?:\s+pod\s+Hradem)?|tělocvična|sportovní\s+hala|hala|bazén|hřiště|stadion|laboratoř)\b/iu.exec(after);
    const location = roomMatch?.[0]?.trim() || namedLocationMatch?.[0]?.trim() || "";
    let date = null;
    if (dayText && monthText) {
      const month = Number(monthText);
      const year = yearText ? Number(yearText) : findYear(month, Number(dayText));
      date = dateKey(new Date(year, month - 1, Number(dayText)));
    }
    return {
      weekday,
      date,
      start: Number(startHour) * 60 + Number(startMinute),
      end: Number(endHour) * 60 + Number(endMinute),
      location,
      instructors,
    };
  }).filter((event) => event.end > event.start && event.location);
}

function normalizeRoomLocation(location) {
  return location.replace(/\s+/g, " ").trim()
    .replace(/\s+(?:aula|posluchárna|laboratoř|laborator|učebna)$/iu, "")
    .toLocaleLowerCase("cs-CZ");
}

function roomLinksByLocation(roomLinks) {
  if (!Array.isArray(roomLinks)) return new Map();
  return new Map(roomLinks.flatMap((roomLink) => {
    if (typeof roomLink?.location !== "string" || typeof roomLink?.url !== "string") return [];
    try {
      const url = new URL(roomLink.url);
      if (url.origin !== "https://is.muni.cz" || url.pathname !== "/auth/kontakty/mistnost") return [];
      return [[normalizeRoomLocation(roomLink.location), url.href]];
    } catch {
      return [];
    }
  }));
}

function attachRoomLinks(events, roomLinks) {
  for (const event of events) {
    const key = normalizeRoomLocation(event.location);
    event.locationUrl = roomLinks.get(key) || "";
  }
  return events;
}

function isoWeekNumber(date) {
  const weekDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - (weekDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((weekDate - yearStart) / 86400000 + 1) / 7);
}

function inferWeekPattern(text, events) {
  const explicitParity = /\b(lich|sud)(?:ý|ého|ém|é|ých|ými)\s+týd(?:en|ny|ne)/iu.exec(text);
  if (explicitParity) {
    return explicitParity[1].toLocaleLowerCase("cs-CZ") === "lich" ? "odd" : "even";
  }
  if (/(?:každý\s+druhý\s+týden|každých?\s+14\s+dn|ob\s+týden)/iu.test(text)) {
    const firstDate = events.map((event) => event.date).filter(Boolean).sort()[0];
    return firstDate
      ? isoWeekNumber(new Date(`${firstDate}T12:00:00`)) % 2 === 0 ? "even" : "odd"
      : "biweekly";
  }
  if (/(?:každ(?:ý|é)\s+týd(?:en|ne)|(?:1×|1x)\s+týdně|týdně)/iu.test(text)) return "weekly";

  const dates = [...new Set(events.map((event) => event.date).filter(Boolean))].sort();
  if (dates.length < 2) return dates.length ? "dated" : "weekly";
  const intervals = dates.slice(1).map((date, index) =>
    Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dates[index]}T00:00:00Z`)) / 86400000),
  );
  if (intervals.every((days) => days % 14 === 0)) {
    return isoWeekNumber(new Date(`${dates[0]}T12:00:00`)) % 2 === 0 ? "even" : "odd";
  }
  if (intervals.every((days) => days % 7 === 0)) return "weekly";
  return "dated";
}

function weekPatternLabel(pattern) {
  if (pattern === "even") return "Sudé týdny";
  if (pattern === "odd") return "Liché týdny";
  if (pattern === "biweekly") return "Každé dva týdny";
  if (pattern === "weekly") return "Každý týden";
  return "Vypsané termíny";
}

function parseCourse(course) {
  const text = course.text || "";
  const roomLinks = roomLinksByLocation(course.roomLinks);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titleLine = lines.find((line) => line.toLocaleLowerCase("cs-CZ").includes(course.code.toLocaleLowerCase("cs-CZ")));
  const title = escapeTitle(course.title || (titleLine ? titleLine.replace(course.code, "").replace(/^[\s:–-]+/, "").trim() : course.code));
  const instructors = extractInstructors(text);
  const sectionMarker = /Rozvrh\s+semin[aá]rn[ií]ch\/paraleln[ií]ch\s+skupin/i.exec(text);
  let scheduleText = "";
  if (sectionMarker) {
    const sectionStart = sectionMarker.index + sectionMarker[0].length;
    const followingSections = /(?:^|\n)\s*(?:Rozvrh(?!\s+semin[aá]rn[ií]ch\/paraleln[ií]ch)|Předpoklady|Omezení\s+zápisu|Mateřské\s+obory|Anotace|Výstupy|Klíčová\s+témata|Studijní\s+zdroje)\b/iu;
    const sectionEndMatch = followingSections.exec(text.slice(sectionStart));
    const sectionEnd = sectionEndMatch ? sectionStart + sectionEndMatch.index : text.length;
    scheduleText = text.slice(sectionMarker.index, sectionEnd);
  }
  const groupHeader = new RegExp(
    `(?:^|\\n)\\s*(${escapeRegExp(course.code)}/[\\p{L}\\p{N}_-]{1,64})\\s*:`,
    "giu",
  );
  const headers = sectionMarker ? [...scheduleText.matchAll(groupHeader)] : [];
  let groups = [];
  if (headers.length) {
    groups = headers.map((header, index) => {
      const start = (header.index || 0) + header[0].length;
      const end = headers[index + 1]?.index ?? scheduleText.length;
      const groupText = scheduleText.slice(start, end);
      const groupInstructors = extractGroupInstructors(groupText, instructors);
      const events = attachRoomLinks(parseOccurrences(groupText, groupInstructors), roomLinks);
      return {
        id: header[1],
        label: header[1],
        weekPattern: inferWeekPattern(groupText, events),
        events,
      };
    }).filter((group) => group.events.length);
  }

  if (!sectionMarker) {
    const scheduleMarker = /(?:^|\n)\s*Rozvrh\s*(?:\n|$)/i.exec(text);
    const fixedSchedule = scheduleMarker ? text.slice(scheduleMarker.index) : text;
    const events = attachRoomLinks(parseOccurrences(fixedSchedule, instructors), roomLinks);
    if (events.length) {
      groups = [{
        id: "schedule",
        label: "Rozvrh",
        weekPattern: inferWeekPattern(fixedSchedule, events),
        events,
      }];
    }
  }

  return {
    code: course.code,
    title,
    instructors,
    semesterStart: course.semesterStart || null,
    groups,
  };
}

function parsedCourses() {
  return state.courses
    .map(parseCourse)
    .filter((course) => course.groups.some((group) => group.events.length > 0));
}

function eventWeekday(event) {
  if (!event.date) return event.weekday;
  const [year, month, day] = event.date.split("-").map(Number);
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

function eventsConflict(first, second) {
  if (first.date && second.date) {
    if (first.date !== second.date) return false;
  } else if (eventWeekday(first) !== eventWeekday(second)) {
    return false;
  }
  return first.start < second.end && second.start < first.end;
}

function normalizeSelectedGroups() {
  for (const course of parsedCourses()) {
    if (course.groups.length === 1 && !(course.code in state.selectedGroups)) {
      state.selectedGroups[course.code] = course.groups[0].id;
      state.collapsedCourses[course.code] = true;
    }
    const group = course.groups.find((candidate) => candidate.id === state.selectedGroups[course.code]);
    if (!group) {
      state.selectedGroups[course.code] = "";
    } else if (state.collapsedCourses[course.code] === undefined) {
      state.collapsedCourses[course.code] = true;
    }
  }
}

function semesterStartForCourses(courses) {
  const validRecords = courses.flatMap((course) => {
    const record = course.semesterStart;
    return record
      && typeof record.facultyId === "string"
      && typeof record.facultyName === "string"
      && typeof record.facultyCode === "string"
      && typeof record.term === "string"
      && typeof record.date === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(record.date)
      ? [{ ...record, courseCode: course.code }]
      : [];
  });
  if (!validRecords.length) return null;

  const facultyCounts = new Map();
  for (const record of validRecords) {
    facultyCounts.set(record.facultyId, (facultyCounts.get(record.facultyId) || 0) + 1);
  }
  const majorityFacultyId = [...facultyCounts.entries()]
    .sort((first, second) => second[1] - first[1])[0][0];
  const majorityFacultyRecords = validRecords.filter((record) => record.facultyId === majorityFacultyId);
  const termCounts = new Map();
  for (const record of majorityFacultyRecords) {
    termCounts.set(record.term, (termCounts.get(record.term) || 0) + 1);
  }
  const majorityTerm = [...termCounts.entries()]
    .sort((first, second) => second[1] - first[1])[0][0];
  return majorityFacultyRecords.find((record) => record.term === majorityTerm) || null;
}

function selectGroup(course, group) {
  if (state.selectedGroups[course.code] === group.id) {
    state.selectedGroups[course.code] = "";
  } else {
    state.selectedGroups[course.code] = group.id;
    state.collapsedCourses[course.code] = true;
    const weekEnd = new Date(state.weekStart);
    weekEnd.setDate(weekEnd.getDate() + 11);
    const facultyStart = course.semesterStart?.date || "";
    const occursThisWeek = group.events.some((event) => {
      if (!event.date) {
        return event.weekday >= 0 && event.weekday < 5
          && (!facultyStart || dateKey(weekEnd) >= facultyStart);
      }
      return event.date >= dateKey(state.weekStart)
        && event.date <= dateKey(weekEnd)
        && (!facultyStart || event.date >= facultyStart);
    });
    if (!occursThisWeek) {
      const today = dateKey(new Date());
      const earliestAllowedDate = facultyStart > today ? facultyStart : today;
      const nextOccurrence = group.events
        .filter((event) => event.date && event.date >= earliestAllowedDate)
        .map((event) => event.date)
        .sort()[0];
      if (nextOccurrence) {
        const [year, month, day] = nextOccurrence.split("-").map(Number);
        state.weekStart = mondayOf(new Date(year, month - 1, day));
      }
    }
  }
  render();
}

function activeGroups() {
  return parsedCourses().flatMap((course) => {
    const selectedId = state.selectedGroups[course.code];
    return course.groups
      .filter((group) => selectedId === group.id)
      .map((group) => ({ course, group }));
  });
}

function courseColor(code) {
  if (state.courseColors[code] !== undefined) return state.courseColors[code];
  const codes = [...new Set(state.courses.map((course) => course.code))].sort((a, b) => a.localeCompare(b));
  const index = Math.max(0, codes.indexOf(code));
  return colorFromHue(Math.round((index * 137.508 + 174) % 360));
}

function colorFromHue(hue) {
  const channel = (n) => {
    const k = (n + hue / 30) % 12;
    const value = 0.62 - 0.34 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * value).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function chooseUniqueCourseColor(courseCode) {
  const usedColors = new Set(
    state.courses
      .filter((course) => course.code !== courseCode)
      .map((course) => courseColor(course.code).toUpperCase()),
  );
  const startHue = [...courseCode].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 360, 0);
  for (let step = 0; step < 360; step += 1) {
    const candidate = colorFromHue((startHue + step) % 360).toUpperCase();
    if (!usedColors.has(candidate)) {
      updateCourseColor(courseCode, candidate);
      return;
    }
  }
  throw new Error("Nepodařilo se najít volnou barvu pro předmět.");
}

function courseInitials(course) {
  const name = course.title
    .replace(/^\S+:\S+\s*/, "")
    .replace(/\s*[-–—]\s*/g, " ")
    .trim();
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((word) => [...word][0].toLocaleUpperCase("cs-CZ")).join("");
}

function groupBadgeText(course, group) {
  const code = group.id === "schedule"
    ? course.code
    : group.label.split("/").slice(1).join("/");
  return `${courseInitials(course)} · ${code}`;
}

function saveCourseColors() {
  localStorage.setItem(COURSE_COLORS_KEY, JSON.stringify(state.courseColors));
}

function updateCourseColor(courseCode, color) {
  if (!/^#[\da-f]{6}$/i.test(color)) return;
  state.courseColors[courseCode] = color.toUpperCase();
  saveCourseColors();
  for (const element of document.querySelectorAll("[data-course-code]")) {
    if (element.dataset.courseCode === courseCode) {
      element.style.setProperty("--course-color", state.courseColors[courseCode]);
    }
  }
  if (activeColorCourse === courseCode) {
    elements.colorDialogInput.value = state.courseColors[courseCode];
    elements.colorDialogValue.value = state.courseColors[courseCode];
  }
}

function openCourseColorDialog(course) {
  activeColorCourse = course.code;
  elements.colorDialogCourse.textContent = `${course.code} · ${course.title}`;
  elements.colorDialogInput.value = courseColor(course.code);
  elements.colorDialogValue.value = courseColor(course.code);
  elements.colorDialog.showModal();
}

function toggleCourseCollapsed(code) {
  state.collapsedCourses[code] = !state.collapsedCourses[code];
  renderSidebar();
}

function groupScheduleText(group) {
  const schedules = [...new Set(group.events.map((event) => {
    const day = DAY_NAMES[event.weekday] || "";
    const start = `${String(Math.floor(event.start / 60)).padStart(2, "0")}:${String(event.start % 60).padStart(2, "0")}`;
    const end = `${String(Math.floor(event.end / 60)).padStart(2, "0")}:${String(event.end % 60).padStart(2, "0")}`;
    return `${day} ${start}–${end}`;
  }))];
  return schedules.slice(0, 3).join(" · ") + (schedules.length > 3 ? ` · +${schedules.length - 3}` : "");
}

function groupInstructorText(group) {
  const instructors = [...new Set(group.events.flatMap((event) => event.instructors))];
  return instructors.join(", ") || "Vyučující neuveden";
}

function renderSidebar() {
  elements.courseList.replaceChildren();
  const parsed = parsedCourses();
  elements.courseCount.textContent = String(parsed.length);
  elements.emptyState.hidden = parsed.length > 0;
  if (state.courses.length > 0 && parsed.length === 0) {
    elements.emptyState.querySelector("strong").textContent = "Nenašel jsem rozvrhy s místností";
    elements.emptyState.querySelector("span").textContent = "Předměty bez rozpoznaného času a místa se do kalendáře nezařazují.";
  } else {
    elements.emptyState.querySelector("strong").textContent = "Kalendář je zatím prázdný";
    elements.emptyState.querySelector("span").textContent = "Načti předměty z přihlášené stránky IS MU pomocí rozšíření.";
  }

  for (const course of parsed) {
    const wrapper = document.createElement("section");
    wrapper.className = "course-group";
    wrapper.dataset.courseCode = course.code;
    wrapper.style.setProperty("--course-color", courseColor(course.code));

    const selectedGroupId = state.selectedGroups[course.code];
    const isCollapsed = state.collapsedCourses[course.code] === true;
    const title = document.createElement("div");
    title.className = "course-title";
    title.tabIndex = 0;
    title.setAttribute("role", "button");
    title.setAttribute("aria-expanded", String(!isCollapsed));
    title.setAttribute("aria-label", `${isCollapsed ? "Rozbalit" : "Sbalit"} ${course.title}`);
    title.addEventListener("click", () => toggleCourseCollapsed(course.code));
    title.addEventListener("keydown", (event) => {
      if (event.target === title && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        toggleCourseCollapsed(course.code);
      }
    });
    const colorDot = document.createElement("span");
    colorDot.className = "course-color-dot";
    colorDot.setAttribute("role", "button");
    colorDot.tabIndex = 0;
    colorDot.setAttribute("aria-label", `Změnit barvu předmětu ${course.title}`);
    colorDot.title = "Kliknutím otevřít výběr barvy";
    const openColorPicker = (event) => {
      event.stopPropagation();
      openCourseColorDialog(course);
    };
    colorDot.addEventListener("click", openColorPicker);
    colorDot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openColorPicker(event);
      }
    });
    const code = document.createElement("span");
    code.className = "course-code";
    code.textContent = course.code;
    const name = document.createElement("span");
    name.className = "course-name";
    name.textContent = course.title;
    title.append(colorDot, code, name);
    if (selectedGroupId) {
      const selectedGroup = course.groups.find((group) => group.id === selectedGroupId);
      if (selectedGroup) {
        const selectedLabel = document.createElement("span");
        selectedLabel.className = "selected-group-label";
        selectedLabel.textContent = selectedGroup.label;
        title.append(selectedLabel);
      }
    }
    wrapper.append(title);

    const details = document.createElement("div");
    details.className = "course-details";
    details.hidden = isCollapsed;
    const visibleGroups = course.groups;
    const choices = document.createElement("div");
    choices.className = "group-choices";
    if (!course.groups.length) {
      const missing = document.createElement("span");
      missing.className = "group-chip";
      missing.textContent = "Rozvrh nenalezen";
      missing.title = "Na stránce se nepodařilo rozpoznat žádný čas výuky.";
      choices.append(missing);
    }
    for (const group of visibleGroups) {
      const chip = document.createElement("button");
      chip.type = "button";
      const selected = state.selectedGroups[course.code] === group.id;
      chip.className = `group-chip${selected ? " selected" : ""}`;
      chip.setAttribute("aria-label", `${course.title}, skupina ${group.label}`);
      const groupLabel = document.createElement("span");
      groupLabel.className = "group-chip-label";
      groupLabel.textContent = course.title;
      chip.append(groupLabel);

      const groupCode = document.createElement("span");
      groupCode.className = "group-chip-code";
      groupCode.textContent = group.label;
      chip.append(groupCode);

      const schedule = document.createElement("span");
      schedule.className = "group-chip-schedule";
      schedule.textContent = group.events.length ? groupScheduleText(group) : "Čas nenalezen";
      chip.append(schedule);

      const frequency = document.createElement("span");
      frequency.className = "group-chip-frequency";
      frequency.textContent = weekPatternLabel(group.weekPattern);
      chip.append(frequency);

      const instructor = document.createElement("span");
      instructor.className = "group-chip-instructor";
      instructor.textContent = groupInstructorText(group);
      chip.append(instructor);

      chip.title = [
        group.label,
        groupInstructorText(group),
        group.events.map((event) => event.location).join(", ") || "Místo se nepodařilo rozpoznat",
      ].join(" · ");
      chip.setAttribute("aria-pressed", String(selected));
      chip.addEventListener("click", () => {
        selectGroup(course, group);
      });
      choices.append(chip);
    }
    details.append(choices);
    wrapper.append(details);
    elements.courseList.append(wrapper);
  }
}

function weekDates(offsetWeeks = 0) {
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(state.weekStart);
    date.setDate(date.getDate() + offsetWeeks * 7 + index);
    return date;
  });
}

function formatWeekTitle(dates) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const monthYear = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" });
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return `${first.getDate()}.–${last.getDate()}. ${monthYear.format(last)}`;
  }
  return `${first.getDate()}. ${new Intl.DateTimeFormat("cs-CZ", { month: "short" }).format(first)} – ${last.getDate()}. ${monthYear.format(last)}`;
}

function weekParityInfo(date) {
  const weekNumber = isoWeekNumber(date);
  const parity = weekNumber % 2 === 0 ? "even" : "odd";
  const parityLabel = parity === "even" ? "SUDÝ" : "LICHÝ";
  return { weekNumber, parity, parityLabel };
}

function renderWeekParity(weeks) {
  const weekInfos = weeks.map((week) => weekParityInfo(week[0]));
  elements.weekParity.textContent = weekInfos
    .map(({ weekNumber, parityLabel }) => `${weekNumber} ${parityLabel}`)
    .join(" · ");
  elements.weekParity.dataset.parity = weekInfos[0].parity;
  elements.weekParity.title = weekInfos
    .map(({ weekNumber, parityLabel }) => `ISO týden ${weekNumber}, ${parityLabel.toLocaleLowerCase("cs-CZ")} týden`)
    .join("; ");
  elements.weekParity.setAttribute("aria-label", elements.weekParity.title);
}

function eventsForDate(date, weekday) {
  return activeGroups().flatMap(({ course, group }) => group.events
    .filter((event) =>
      (event.date ? event.date === dateKey(date) : event.weekday === weekday)
      && (!course.semesterStart?.date || dateKey(date) >= course.semesterStart.date),
    )
    .map((event) => ({ ...event, course, group })));
}

function allGroupEventsForDate(date, weekday) {
  return parsedCourses().flatMap((course) => course.groups.flatMap((group) =>
    group.events
      .filter((event) => event.date ? event.date === dateKey(date) : event.weekday === weekday)
      .filter(() => !course.semesterStart?.date || dateKey(date) >= course.semesterStart.date)
      .map((event) => ({ ...event, course, group })),
  ));
}

function assignLanes(events) {
  const lanes = [];
  for (const event of events.sort((a, b) => a.start - b.start || a.end - b.end)) {
    let lane = lanes.findIndex((laneEnd) => laneEnd <= event.start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = event.end;
    event.lane = lane;
  }
  return lanes.length;
}

function eventTooltip(event) {
  const time = `${String(Math.floor(event.start / 60)).padStart(2, "0")}:${String(event.start % 60).padStart(2, "0")}–${String(Math.floor(event.end / 60)).padStart(2, "0")}:${String(event.end % 60).padStart(2, "0")}`;
  return [
    event.group.id === "schedule" ? event.course.code : event.group.label,
    event.course.title,
    `Čas: ${time}`,
    `Vyučující: ${event.instructors.join(", ") || "neuveden"}`,
    `Místo: ${event.location}`,
  ].join("\n");
}

function showEventDetails(card, event) {
  eventPopover?.remove();
  const popover = document.createElement("aside");
  popover.className = "event-popover";
  popover.dataset.courseCode = event.course.code;
  popover.style.setProperty("--course-color", courseColor(event.course.code));

  const addDetail = (className, text) => {
    const detail = document.createElement("div");
    detail.className = className;
    detail.textContent = text;
    popover.append(detail);
  };
  addDetail("event-popover-code", event.group.id === "schedule" ? event.course.code : event.group.label);
  addDetail("event-popover-title", event.course.title);
  const start = `${String(Math.floor(event.start / 60)).padStart(2, "0")}:${String(event.start % 60).padStart(2, "0")}`;
  const end = `${String(Math.floor(event.end / 60)).padStart(2, "0")}:${String(event.end % 60).padStart(2, "0")}`;
  addDetail("event-popover-detail", `Čas: ${start}–${end}`);
  addDetail("event-popover-detail", `Vyučující: ${event.instructors.join(", ") || "neuveden"}`);
  addDetail("event-popover-detail", `Místo: ${event.location}`);
  document.body.append(popover);

  const anchor = card.getBoundingClientRect();
  const bounds = popover.getBoundingClientRect();
  const left = Math.max(12, Math.min(anchor.left, window.innerWidth - bounds.width - 12));
  const below = anchor.bottom + 8;
  const top = below + bounds.height <= window.innerHeight - 12
    ? below
    : Math.max(12, anchor.top - bounds.height - 8);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  eventPopover = popover;
}

function renderCalendar() {
  eventPopover?.remove();
  eventPopover = undefined;
  const weeks = [weekDates(), weekDates(1)];
  const dates = weeks.flat();
  elements.weekTitle.textContent = formatWeekTitle(dates);
  renderWeekParity(weeks);
  elements.timeLabels.replaceChildren();
  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
    const label = document.createElement("span");
    label.className = "time-label";
    label.textContent = `${String(hour).padStart(2, "0")}:00`;
    elements.timeLabels.append(label);
  }
  elements.calendar.replaceChildren();

  for (const week of weeks) {
    const weekStartInfo = weekParityInfo(week[0]);
    const weekHeading = document.createElement("div");
    weekHeading.className = "week-section-heading";
    const weekRange = document.createElement("span");
    weekRange.className = "week-section-range";
    weekRange.textContent = formatWeekTitle(week);
    const weekBadge = document.createElement("span");
    weekBadge.className = "week-section-parity";
    weekBadge.dataset.parity = weekStartInfo.parity;
    weekBadge.textContent = `ISO ${weekStartInfo.weekNumber} · ${weekStartInfo.parityLabel} TÝDEN`;
    weekHeading.append(weekRange, weekBadge);
    const startsInWeek = new Map();
    for (const course of state.courses) {
      const start = course.semesterStart;
      if (!start?.date || start.date < dateKey(week[0]) || start.date > dateKey(week[4])) continue;
      if (!startsInWeek.has(start.date)) startsInWeek.set(start.date, new Set());
      startsInWeek.get(start.date).add(start.facultyCode);
    }
    for (const [startDate, faculties] of startsInWeek) {
      const startBadge = document.createElement("span");
      startBadge.className = "semester-start-badge";
      const formattedDate = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" })
        .format(new Date(`${startDate}T12:00:00`));
      startBadge.textContent = `VÝUKA OD ${formattedDate} · ${[...faculties].join(", ")}`;
      startBadge.title = `Oficiální začátek výuky podle harmonogramu IS MU: ${[...faculties].join(", ")}`;
      weekHeading.append(startBadge);
    }
    elements.calendar.append(weekHeading);

    for (const [index, date] of week.entries()) {
    const row = document.createElement("div");
    row.className = "day-row";
    const dayLabel = document.createElement("div");
    dayLabel.className = `day-label${dateKey(date) === dateKey(new Date()) ? " today" : ""}`;
    const dayName = document.createElement("span");
    dayName.className = "day-name";
    dayName.textContent = DAY_NAMES[index];
    const dayDate = document.createElement("span");
    dayDate.className = "day-date";
    dayDate.textContent = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" }).format(date);
    dayLabel.append(dayName, dayDate);

    const track = document.createElement("div");
    track.className = "day-track";
    const allEvents = allGroupEventsForDate(date, index);
    const selectedEvents = allEvents.filter((event) => state.selectedGroups[event.course.code] === event.group.id);
    const markers = allEvents.filter((event) =>
      !state.selectedGroups[event.course.code]
      && !selectedEvents.some((selected) => selected.course.code !== event.course.code && eventsConflict(event, selected)),
    );
    const laneCount = Math.max(1, assignLanes(selectedEvents));
    const markerLaneCount = assignLanes(markers);
    const markerHeight = markerLaneCount ? markerLaneCount * 16 + 10 : 0;
    track.style.height = `max(calc(var(--lane-height) * ${laneCount}), ${markerHeight}px)`;
    row.append(dayLabel, track);
    elements.calendar.append(row);

    for (const event of markers) {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "group-marker";
      marker.dataset.courseCode = event.course.code;
      marker.style.setProperty("--course-color", courseColor(event.course.code));
      marker.style.left = `${((event.start - START_HOUR * 60) / ((END_HOUR - START_HOUR) * 60)) * 100}%`;
      marker.style.top = `${5 + event.lane * 16}px`;
      marker.textContent = groupBadgeText(event.course, event.group);
      marker.title = `${event.course.title} · ${event.group.label} · ${eventTooltip(event)}`;
      marker.setAttribute("aria-label", `Vybrat ${event.course.title}, skupina ${event.group.label}`);
      marker.addEventListener("click", () => {
        selectGroup(event.course, event.group);
      });
      track.append(marker);
    }

    const eventCards = [];
    for (const event of selectedEvents) {
      const start = Math.max(event.start, START_HOUR * 60);
      const end = Math.min(event.end, END_HOUR * 60);
      if (end <= start) continue;
      const card = document.createElement("article");
      card.className = "event-card";
      card.dataset.courseCode = event.course.code;
      card.style.setProperty("--course-color", courseColor(event.course.code));
      card.style.left = `${((start - START_HOUR * 60) / ((END_HOUR - START_HOUR) * 60)) * 100}%`;
      card.style.width = `${((end - start) / ((END_HOUR - START_HOUR) * 60)) * 100}%`;
      card.style.top = `calc(var(--lane-height) * ${event.lane} + 5px)`;
      card.tabIndex = 0;
      card.setAttribute("role", "group");
      card.setAttribute("aria-label", eventTooltip(event));
      card.addEventListener("mouseenter", () => showEventDetails(card, event));
      card.addEventListener("mouseleave", () => {
        eventPopover?.remove();
        eventPopover = undefined;
      });
      card.addEventListener("focus", () => showEventDetails(card, event));
      card.addEventListener("blur", () => {
        eventPopover?.remove();
        eventPopover = undefined;
      });

      const eventCode = document.createElement("span");
      eventCode.className = "event-code";
      eventCode.textContent = groupBadgeText(event.course, event.group);
      const eventName = document.createElement("span");
      eventName.className = "event-name";
      eventName.textContent = event.course.title;
      const eventMeta = document.createElement(event.locationUrl ? "a" : "span");
      eventMeta.className = "event-meta";
      eventMeta.textContent = event.location;
      if (event.locationUrl) {
        eventMeta.href = event.locationUrl;
        eventMeta.target = "_blank";
        eventMeta.rel = "noopener noreferrer";
        eventMeta.setAttribute("aria-label", `Otevřít informace o místnosti ${event.location} v IS MU`);
      }
      card.append(eventCode, eventName, eventMeta);
      track.append(card);
      eventCards.push({ card, event });
    }

    const laneHeights = Array(laneCount).fill(78);
    for (const { card, event } of eventCards) {
      laneHeights[event.lane] = Math.max(laneHeights[event.lane], Math.ceil(card.getBoundingClientRect().height) + 10);
    }
    let laneTop = 0;
    for (let lane = 0; lane < laneCount; lane += 1) {
      for (const { card, event } of eventCards) {
        if (event.lane === lane) card.style.top = `${laneTop + 5}px`;
      }
      laneTop += laneHeights[lane];
    }
    track.style.height = `max(${Math.max(78, laneTop)}px, ${markerHeight}px)`;
    }
  }

  const hasCalendarEvents = weeks.some((week) =>
    week.some((date, index) => allGroupEventsForDate(date, index).length > 0),
  );
  elements.calendarEmpty.classList.toggle("visible", state.courses.length > 0 && !hasCalendarEvents);
}

function render() {
  normalizeSelectedGroups();
  renderSidebar();
  renderCalendar();
}

function updateCourses(courses) {
  const snapshot = JSON.stringify(courses);
  if (snapshot !== lastCoursesSnapshot) {
    state.courses = courses;
    state.semesterStart = semesterStartForCourses(courses);
    if (state.semesterStart) {
      const [year, month, day] = state.semesterStart.date.split("-").map(Number);
      state.weekStart = mondayOf(new Date(year, month - 1, day));
    }
    lastCoursesSnapshot = snapshot;
    render();
  }

  const validCourseCount = parsedCourses().length;
  const roomLinkCount = state.courses.reduce(
    (count, course) => count + (Array.isArray(course.roomLinks) ? course.roomLinks.length : 0),
    0,
  );
  const semesterStatus = state.semesterStart
    ? `Začátek výuky ${state.semesterStart.facultyCode}: ${new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(`${state.semesterStart.date}T12:00:00`))}.`
    : "Harmonogram začátku výuky zatím není načten.";
  elements.status.textContent = state.courses.length
    ? `Načteno ${validCourseCount} předmětů s místností z ${state.courses.length}; odkazy na místnosti: ${roomLinkCount}. ${semesterStatus}`
    : "Čekám na předměty…";
  elements.status.className = `sync-status${validCourseCount ? " success" : state.courses.length ? " error" : ""}`;
  elements.clearDataButton.hidden = state.courses.length === 0;
}

function refreshCourses() {
  try {
    const stored = localStorage.getItem(COURSES_STORAGE_KEY);
    const data = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(data)) throw new Error("Uložený rozvrh nemá očekávaný formát.");
    updateCourses(data);
  } catch (error) {
    elements.status.textContent = `Uložený rozvrh se nepodařilo načíst: ${error.message}`;
    elements.status.className = "sync-status error";
  }
}

document.querySelector("#previous-week").addEventListener("click", () => {
  state.weekStart.setDate(state.weekStart.getDate() - 7);
  renderCalendar();
});
document.querySelector("#next-week").addEventListener("click", () => {
  state.weekStart.setDate(state.weekStart.getDate() + 7);
  renderCalendar();
});
document.querySelector("#today-button").addEventListener("click", () => {
  state.weekStart = mondayOf(new Date());
  renderCalendar();
});
elements.importFileButton.addEventListener("click", () => elements.coursesFile.click());
elements.coursesFile.addEventListener("change", async () => {
  const [file] = elements.coursesFile.files || [];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const courses = Array.isArray(payload) ? payload : payload?.courses;
    if (!Array.isArray(courses) || courses.length > 100 || !courses.every((course) => course && typeof course === "object" && !Array.isArray(course))) {
      throw new Error("Soubor musí obsahovat seznam nejvýše 100 předmětů.");
    }
    localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(courses));
    updateCourses(courses);
    elements.status.textContent = `Importováno ${courses.length} předmětů z ${file.name}. Data jsou uložena lokálně v tomto prohlížeči.`;
    elements.status.className = "sync-status success";
  } catch (error) {
    elements.status.textContent = `Import se nepodařil: ${error instanceof Error ? error.message : String(error)}`;
    elements.status.className = "sync-status error";
  } finally {
    elements.coursesFile.value = "";
  }
});
elements.clearDataButton.addEventListener("click", () => {
  if (!window.confirm("Smazat importované předměty z tohoto prohlížeče?")) return;
  localStorage.removeItem(COURSES_STORAGE_KEY);
  state.courses = [];
  state.semesterStart = null;
  lastCoursesSnapshot = undefined;
  updateCourses([]);
});

elements.colorDialogInput.addEventListener("input", () => {
  if (activeColorCourse) updateCourseColor(activeColorCourse, elements.colorDialogInput.value);
});
elements.colorDialogValue.addEventListener("input", () => {
  if (activeColorCourse && /^#[\da-f]{6}$/i.test(elements.colorDialogValue.value)) {
    updateCourseColor(activeColorCourse, elements.colorDialogValue.value);
  }
});
elements.colorDialogUnique.addEventListener("click", () => {
  if (activeColorCourse) chooseUniqueCourseColor(activeColorCourse);
});
elements.colorDialog.addEventListener("close", () => {
  activeColorCourse = undefined;
});

refreshCourses();
