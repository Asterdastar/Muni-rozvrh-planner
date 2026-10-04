const exportButton = document.querySelector("#export");
const status = document.querySelector("#status");

function setStatus(message, className = "") {
  status.textContent = message;
  status.className = className;
}

async function downloadCourses(courses) {
  const blobUrl = URL.createObjectURL(
    new Blob(
      [JSON.stringify({ courses }, null, 2)],
      { type: "application/json;charset=utf-8" },
    ),
  );
  try {
    await chrome.downloads.download({
      url: blobUrl,
      filename: "rozvrh-predmety.json",
      saveAs: true,
    });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  setStatus("Načítám předměty, rozvrhy a harmonogram IS MU…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://is.muni.cz/")) {
      throw new Error("Otevři přihlášený seznam předmětů v IS MU a spusť export z této karty.");
    }

    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id, { type: "collect-courses" });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Receiving end does not exist")) {
        throw new Error("Skript rozšíření v této kartě neběží. Obnov kartu IS MU (Ctrl+R) a export opakuj.");
      }
      throw error;
    }
    if (!result?.ok) {
      throw new Error(result?.error || "Rozšíření nedostalo platnou odpověď z IS MU.");
    }
    if (!Array.isArray(result.courses) || result.courses.length === 0) {
      throw new Error("Z IS MU se nepodařilo načíst žádné předměty.");
    }

    await downloadCourses(result.courses);
    const roomLinkCount = result.courses.reduce(
      (count, course) => count + (Array.isArray(course.roomLinks) ? course.roomLinks.length : 0),
      0,
    );
    const semesterStartCount = result.courses.filter((course) => course.semesterStart?.date).length;
    const failures = result.failures?.length
      ? ` Upozornění: ${result.failures.length} doplňkových údajů se nepodařilo načíst.`
      : "";
    setStatus(
      `Staženo ${result.courses.length} předmětů. Odkazy na místnosti: ${roomLinkCount}; začátek výuky: ${semesterStartCount}.${failures}`,
      result.failures?.length ? "" : "success",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    exportButton.disabled = false;
  }
});
