(() => {
if (globalThis.__rozvrhIsMuListenerInstalled) return;

const COURSE_CODE_PATTERN = /\b[A-Za-z]{1,8}\d{2,5}[A-Za-z]?\b/;
const ROOM_CODE_PATTERN = /\b[A-Z]{1,3}\d{1,3}(?:\/\d{2,5}|,\d{3,5})\b(?:\s+(?:aula|posluchárna|laboratoř|laborator|učebna))?/iu;
const ROOM_NAME_PATTERN = /\b(?:posilovna(?:\s+pod\s+Hradem)?|tělocvična|sportovní\s+hala|hala|bazén|hřiště|stadion|laboratoř)\b/iu;
const ROOM_LINK_PATH = "/auth/kontakty/mistnost";
const ACADEMIC_CALENDAR_URL = "https://is.muni.cz/predmety/obdobi?lang=cs";
const MAX_COURSES = 100;

function cleanCourseTitle(value) {
  return (value || "").replace(/\s*[-–—]\s*informace o předmětu\s*$/iu, "").trim();
}

function visibleText(node) {
  return (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
}

function findCourseLinks() {
  const links = new Map();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const codeMatch = visibleText(anchor).match(COURSE_CODE_PATTERN);
    if (!codeMatch || !anchor.href.startsWith(location.origin)) continue;
    const url = new URL(anchor.href);
    if (url.pathname === location.pathname && url.search === location.search) continue;
    if (/logout|odhl[aá]sit|napov[eě]da/i.test(anchor.href)) continue;
    links.set(anchor.href, {
      code: codeMatch[0],
      title: cleanCourseTitle(visibleText(anchor).replace(codeMatch[0], "").replace(/^[\s:–-]+/, "")),
      url: anchor.href,
    });
    if (links.size >= MAX_COURSES) break;
  }
  return [...links.values()];
}

function extractRoomLinks(root) {
  return [...root.querySelectorAll("a[href]")]
    .flatMap((anchor) => {
      let url;
      try {
        url = new URL(anchor.getAttribute("href"), location.origin);
      } catch {
        return [];
      }
      if (url.origin !== location.origin || url.pathname !== ROOM_LINK_PATH) return [];
      const label = [visibleText(anchor), anchor.getAttribute("aria-label"), anchor.title].filter(Boolean).join(" ");
      const parentLabel = visibleText(anchor.parentElement || anchor);
      const locationName = label.match(ROOM_CODE_PATTERN)?.[0]?.trim()
        || label.match(ROOM_NAME_PATTERN)?.[0]?.trim()
        || parentLabel.match(ROOM_CODE_PATTERN)?.[0]?.trim()
        || parentLabel.match(ROOM_NAME_PATTERN)?.[0]?.trim();
      return locationName ? [{ location: locationName, url: url.href }] : [];
    });
}

function readDocument(html, course) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const title = cleanCourseTitle(parsed.querySelector("h1, h2")?.textContent) || cleanCourseTitle(course.title);
  const text = documentText(parsed.body);
  return { ...course, title, text, roomLinks: extractRoomLinks(parsed) };
}

async function fetchAcademicPeriod(term) {
  const termName = term.replace(/^([a-z]+)(\d{4})$/i, "$1 $2");
  const response = await fetch(ACADEMIC_CALENDAR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ lang: "cs", uo: termName }),
    credentials: "omit",
  });
  if (!response.ok) throw new Error(`Harmonogram IS MU pro ${termName} se nepodařilo načíst (${response.status}).`);
  const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
  const table = parsed.querySelector(`table[id="obdobi:${term}"]`);
  const startRow = [...(table?.rows || [])].find((row) =>
    row.cells[0]?.querySelector("strong")?.textContent.trim().toLocaleLowerCase("cs-CZ") === "výuka"
    && row.cells[1]?.textContent.trim().toLocaleLowerCase("cs-CZ") === "od",
  );
  if (!table || !startRow) {
    throw new Error(`V harmonogramu IS MU jsem nenašel začátek výuky pro ${termName}.`);
  }

  const faculties = [...table.rows[0].cells]
    .filter((cell) => cell.className.match(/(?:^|\s)slop:(\d+)(?:\s|$)/))
    .map((cell) => {
      const facultyId = cell.className.match(/(?:^|\s)slop:(\d+)(?:\s|$)/)?.[1];
      const startCell = [...startRow.cells].find((candidate) =>
        candidate.className.split(/\s+/).includes(`slop:${facultyId}`),
      );
      const dateMatch = startCell?.textContent.replace(/\u00a0/g, " ").match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/);
      if (!facultyId || !dateMatch) return null;
      const [, day, month, year] = dateMatch;
      return {
        id: facultyId,
        code: cell.textContent.trim(),
        name: cell.title.trim(),
        date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      };
    })
    .filter(Boolean);

  if (!faculties.length) {
    throw new Error(`V harmonogramu IS MU jsem nenašel začátky výuky pro fakulty (${termName}).`);
  }
  return { term, faculties };
}

function addSemesterStart(course, academicPeriods) {
  const term = new URL(course.url).pathname.match(/\/(podzim\d{4}|jaro\d{4})(?:\/|$)/i)?.[1]?.toLocaleLowerCase("cs-CZ");
  if (!term) return course;
  const titleFacultyCode = course.title.match(/^([^:]+):/)?.[1]?.trim().toLocaleLowerCase("cs-CZ");
  const period = academicPeriods.find((candidate) => candidate.term.toLocaleLowerCase("cs-CZ") === term);
  const faculty = period?.faculties.find((candidate) =>
    candidate.code.toLocaleLowerCase("cs-CZ") === titleFacultyCode,
  );
  return faculty
    ? { ...course, semesterStart: { term, facultyId: faculty.id, facultyName: faculty.name, facultyCode: faculty.code, date: faculty.date } }
    : course;
}

function documentText(root) {
  if (!root) return "";
  const blockTags = new Set(["ADDRESS", "ARTICLE", "DD", "DIV", "DL", "DT", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "P", "SECTION", "TR"]);
  function collect(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.tagName === "BR") return "\n";
    const content = Array.from(node.childNodes, collect).join("");
    return blockTags.has(node.tagName) ? `\n${content}\n` : content;
  }
  return collect(root).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

async function fetchCourse(course) {
  const response = await fetch(course.url, { credentials: "include", redirect: "follow" });
  if (!response.ok) throw new Error(`${course.code}: stránku se nepodařilo načíst (${response.status}).`);
  const html = await response.text();
  return readDocument(html, course);
}

async function collectCourses() {
  const links = findCourseLinks();
  const results = [];
  const failures = [];
  if (!links.length) {
    const code = document.body.innerText.match(COURSE_CODE_PATTERN)?.[0];
    if (code) {
      results.push({
        code,
        title: document.querySelector("h1, h2")?.textContent?.trim() || "",
        url: location.href,
        text: document.body.innerText,
        roomLinks: extractRoomLinks(document),
      });
    } else {
      throw new Error("Na stránce jsem nenašel odkazy na předměty. Otevři seznam zapsaných předmětů v IS MU.");
    }
  } else {
    for (let index = 0; index < links.length; index += 4) {
      const batch = links.slice(index, index + 4);
      const settled = await Promise.allSettled(batch.map(fetchCourse));
      for (const item of settled) {
        if (item.status === "fulfilled") results.push(item.value);
        else failures.push(item.reason instanceof Error ? item.reason.message : String(item.reason));
      }
    }
  }
  if (!results.length) {
    throw new Error(failures[0] || "Nepodařilo se načíst žádný předmět.");
  }
  const terms = [...new Set(results
    .map((course) => new URL(course.url).pathname.match(/\/(podzim\d{4}|jaro\d{4})(?:\/|$)/i)?.[1]?.toLocaleLowerCase("cs-CZ"))
    .filter(Boolean))];
  const academicPeriods = [];
  if (!terms.length) {
    failures.push("U importovaných předmětů jsem nenašel semestrální období.");
  } else {
    const periodResults = await Promise.allSettled(terms.map(fetchAcademicPeriod));
    for (const result of periodResults) {
      if (result.status === "fulfilled") academicPeriods.push(result.value);
      else failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }
  return { courses: results.map((course) => addSemesterStart(course, academicPeriods)), failures };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "collect-courses") return false;
  collectCourses().then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  return true;
});

globalThis.__rozvrhIsMuListenerInstalled = true;
})();
