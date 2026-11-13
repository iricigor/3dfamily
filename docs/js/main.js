"use strict";

function setMenuOpen(open) {
  menu.hidden = !open;
  menuToggle.setAttribute("aria-expanded", String(open));
}

menuToggle.addEventListener("click", () => {
  const open = menu.hidden;
  setMenuOpen(open);
  if (open) menu.querySelector("button, input, select").focus();
});
document.addEventListener("click", (event) => {
  if (!menu.hidden && !menu.contains(event.target) && !menuToggle.contains(event.target)) setMenuOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !menu.hidden) {
    setMenuOpen(false);
    menuToggle.focus();
  }
});
menu.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const controls = [...menu.querySelectorAll("button, input, select")]
    .filter((control) => !control.disabled && control.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

const themePreferenceKey = "3dfamily.visualTheme";
const appearancePreferenceKey = "3dfamily.appearance";
const cameraModePreferenceKey = "3dfamily.cameraModeSelector";
const systemAppearance = window.matchMedia?.("(prefers-color-scheme: dark)");
const readPreference = (key, fallback, allowed) => {
  try {
    const saved = localStorage.getItem(key);
    return allowed.includes(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
};
const savePreference = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
};
let appearanceMode = readPreference(appearancePreferenceKey, "light", ["light", "dark", "system"]);
visualThemeSelect.value = readPreference(themePreferenceKey, "standard", ["standard", "space", "heritage"]);
appearanceSelect.value = appearanceMode;
cameraModeSelector.checked = readPreference(cameraModePreferenceKey, "true", ["true", "false"]) === "true";

function applyVisualSettings() {
  const root = document.documentElement;
  root.dataset.visualTheme = visualThemeSelect.value;
  root.dataset.theme = appearanceMode === "system"
    ? systemAppearance?.matches ? "dark" : "light"
    : appearanceMode;
  if (familyData) renderFamily(familyData, centerPersonId);
}

applyVisualSettings();
visualThemeSelect.addEventListener("change", () => {
  savePreference(themePreferenceKey, visualThemeSelect.value);
  applyVisualSettings();
});
appearanceSelect.addEventListener("change", () => {
  appearanceMode = appearanceSelect.value;
  savePreference(appearancePreferenceKey, appearanceMode);
  applyVisualSettings();
});
cameraModeSelector.addEventListener("change", () => {
  savePreference(cameraModePreferenceKey, String(cameraModeSelector.checked));
});
systemAppearance?.addEventListener?.("change", () => {
  if (appearanceMode === "system") applyVisualSettings();
});
if (systemAppearance && !systemAppearance.addEventListener) {
  systemAppearance.addListener(() => {
    if (appearanceMode === "system") applyVisualSettings();
  });
}

function updatePersonChooser(individuals, selectedId) {
  const people = [...individuals.values()];
  const names = new Map();
  for (const person of people) {
    const name = person.name || `Unknown person (${person.id})`;
    names.set(name, (names.get(name) || 0) + 1);
  }
  pickerIds.clear();
  personOptions.replaceChildren();
  for (const person of people) {
    const name = person.name || `Unknown person (${person.id})`;
    const label = names.get(name) > 1 ? `${name} (${person.id})` : name;
    const option = document.createElement("option");
    option.value = label;
    personOptions.append(option);
    pickerIds.set(label, person.id);
  }
  const selected = individuals.get(selectedId);
  personPicker.value = selected
    ? (names.get(selected.name || `Unknown person (${selected.id})`) > 1
      ? `${selected.name || `Unknown person (${selected.id})`} (${selected.id})`
      : selected.name || `Unknown person (${selected.id})`)
    : "";
}

personPicker.addEventListener("change", () => {
  const id = pickerIds.get(personPicker.value);
  if (familyData && id) renderFamily(familyData, id);
});

simplifyNames.addEventListener("change", () => {
  if (familyData) renderFamily(familyData, centerPersonId);
});

showSecondRelatives.addEventListener("change", () => {
  if (familyData) renderFamily(familyData, centerPersonId);
});

cardColors.addEventListener("change", () => {
  colorLegend.hidden = cardColors.value !== "sex";
  if (familyData) renderFamily(familyData, centerPersonId);
});

document.querySelector("#change-file").addEventListener("click", () => fileInput.click());

peopleList.addEventListener("click", (event) => {
  const card = event.target.closest(".person");
  if (!familyData || !card || !peopleList.contains(card)) return;
  renderFamily(familyData, card.dataset.personId);
  peopleList.querySelector(".person.center").focus();
});

window.addEventListener("resize", () => layoutScene());

uploadArea.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadArea.classList.add("is-dragging");
});

uploadArea.addEventListener("dragleave", (event) => {
  if (!uploadArea.contains(event.relatedTarget)) uploadArea.classList.remove("is-dragging");
});

uploadArea.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadArea.classList.remove("is-dragging");
  if (event.dataTransfer.files.length) {
    fileInput.files = event.dataTransfer.files;
    fileInput.dispatchEvent(new Event("change"));
  }
});

async function openFamilyFile(file) {
  const version = ++uploadVersion;
  if (!file) return;

  delete status.dataset.error;
  status.dataset.loading = "true";
  status.textContent = `Opening ${file.name}…`;
  try {
    const data = parseGedcom(await file.text());
    if (!data.individuals.size) {
      throw new Error("We couldn't find any people in that file. Choose a GEDCOM (.ged) family-tree export and try again.");
    }
    if (version !== uploadVersion) return;
    await initializeScene();
    if (version !== uploadVersion) return;
    familyData = null;
    familyView.hidden = true;
    clearScene();
    peopleList.replaceChildren();
    personPicker.value = "";
    document.querySelector("#explorer-help").hidden = false;
    welcome.classList.add("loaded");
    uploadArea.classList.add("loaded");
    main.classList.add("exploring");
    document.querySelector("#upload-label").textContent = "Change file";
    const filename = document.querySelector("#filename");
    filename.textContent = file.name;
    renderFamily(data);
    familyData = data;
  } catch (error) {
    if (version !== uploadVersion) return;
    status.dataset.error = "true";
    status.textContent = error instanceof Error
      ? error.message
      : "We couldn't open that family-tree file. Please try another GEDCOM (.ged) file.";
  } finally {
    if (version === uploadVersion) delete status.dataset.loading;
  }
}

fileInput.addEventListener("change", () => openFamilyFile(fileInput.files?.[0]));
document.querySelector("#try-example").addEventListener("click", () => {
  openFamilyFile(new File([exampleGedcom], "example-family.ged", { type: "text/plain" }));
});
