import type { FilterState, HttpMethod, MethodFilter } from "../../shared/types";

type ToolbarEvents = {
  onFiltersChanged: (state: FilterState) => void;
  onClear: () => void;
  onExport: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onCaptureToggled: (enabled: boolean) => void;
  onSearchNavigate: (direction: "prev" | "next") => void;
};

const METHOD_ORDER: MethodFilter[] = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE", "OTHER"];
const CAPTURE_ENABLED_KEY = "captureEnabled";

async function getStoredIncludeInternal(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["includeInternalEndpoints"], (items: Record<string, unknown>) => {
      resolve(Boolean(items.includeInternalEndpoints));
    });
  });
}

function setStoredIncludeInternal(value: boolean): void {
  chrome.storage.local.set({ includeInternalEndpoints: value });
}

async function getStoredCaptureEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get([CAPTURE_ENABLED_KEY], (items: Record<string, unknown>) => {
      const value = items[CAPTURE_ENABLED_KEY];
      resolve(typeof value === "boolean" ? value : true);
    });
  });
}

function setStoredCaptureEnabled(value: boolean): void {
  chrome.storage.local.set({ [CAPTURE_ENABLED_KEY]: value });
}

export class Toolbar {
  private readonly root: HTMLElement;
  private readonly events: ToolbarEvents;
  private state: FilterState;

  constructor(root: HTMLElement, events: ToolbarEvents) {
    this.root = root;
    this.events = events;
    this.state = {
      selectedMethod: "ALL",
      searchText: "",
      includeInternal: false,
      captureEnabled: true
    };
  }

  async render(): Promise<void> {
    this.state.includeInternal = await getStoredIncludeInternal();
    this.state.captureEnabled = await getStoredCaptureEnabled();

    const methodOptions = METHOD_ORDER.map(
      (method) => `<option value="${method}" ${this.state.selectedMethod === method ? "selected" : ""}>${method}</option>`
    ).join("");

    this.root.innerHTML = `
      <div class="toolbar-row">
        <label for="method-filter">Method</label>
        <select class="select-input" id="method-filter">${methodOptions}</select>
        <input class="text-input" id="search-input" type="text" placeholder="Filter by..." />
        <span id="search-nav" class="search-nav" role="group" aria-label="Search results navigation">
          <span id="search-match-count" class="search-match-count" aria-live="polite"></span>
          <button id="search-prev-btn" class="icon-btn search-nav-btn" title="Previous match" aria-label="Previous match">
            <span class="search-arrow" aria-hidden="true">&#9664;</span>
          </button>
          <button id="search-next-btn" class="icon-btn search-nav-btn" title="Next match" aria-label="Next match">
            <span class="search-arrow" aria-hidden="true">&#9654;</span>
          </button>
        </span>
      </div>
      <div class="toolbar-row">
        <label id="capture-toggle-label" class="internal-state capture-state ${this.state.captureEnabled ? "active" : "paused"}">
          <input id="capture-toggle" type="checkbox" ${this.state.captureEnabled ? "checked" : ""} />
          <span id="capture-state-text">${this.state.captureEnabled ? "Capturing" : "Paused"}</span>
        </label>
        <label id="internal-toggle-label" class="internal-state ${this.state.includeInternal ? "active" : "paused"}">
          <input id="internal-toggle" type="checkbox" ${this.state.includeInternal ? "checked" : ""} />
          <span>Show Internal Endpoints</span>
        </label>
        <button id="clear-btn" class="action-btn action-btn-clear">Clear</button>
        <button id="expand-all-btn" class="action-btn">Expand All</button>
        <button id="collapse-all-btn" class="action-btn">Collapse All</button>
        <button id="export-btn" class="action-btn">Export JSON</button>
      </div>
    `;

    const methodFilter = this.root.querySelector<HTMLSelectElement>("#method-filter");
    methodFilter?.addEventListener("change", () => {
      this.state.selectedMethod = (methodFilter.value as MethodFilter) || "ALL";
      this.events.onFiltersChanged(this.getState());
    });

    const searchInput = this.root.querySelector<HTMLInputElement>("#search-input");
    const renderSearchInputState = (): void => {
      if (!searchInput) {
        return;
      }
      searchInput.classList.toggle("active", Boolean(searchInput.value.trim()));
    };

    renderSearchInputState();
    this.updateSearchMatches(0, 0);
    searchInput?.addEventListener("input", () => {
      this.state.searchText = searchInput.value.trim().toLowerCase();
      renderSearchInputState();
      this.updateSearchMatches(0, 0);
      this.events.onFiltersChanged(this.getState());
    });

    this.root.querySelector<HTMLButtonElement>("#search-prev-btn")?.addEventListener("click", () => {
      this.events.onSearchNavigate("prev");
    });

    this.root.querySelector<HTMLButtonElement>("#search-next-btn")?.addEventListener("click", () => {
      this.events.onSearchNavigate("next");
    });

    const internalToggle = this.root.querySelector<HTMLInputElement>("#internal-toggle");
    const renderIncludeInternalState = (): void => {
      const internalLabel = this.root.querySelector<HTMLElement>("#internal-toggle-label");
      if (!internalLabel || !internalToggle) {
        return;
      }

      internalLabel.classList.toggle("active", internalToggle.checked);
      internalLabel.classList.toggle("paused", !internalToggle.checked);
    };

    renderIncludeInternalState();
    internalToggle?.addEventListener("change", () => {
      const checked = Boolean(internalToggle.checked);
      this.state.includeInternal = checked;
      renderIncludeInternalState();
      setStoredIncludeInternal(checked);
      this.events.onFiltersChanged(this.getState());
    });

    this.root.querySelector<HTMLButtonElement>("#clear-btn")?.addEventListener("click", () => {
      this.events.onClear();
    });

    this.root.querySelector<HTMLButtonElement>("#expand-all-btn")?.addEventListener("click", () => {
      this.events.onExpandAll();
    });

    this.root.querySelector<HTMLButtonElement>("#collapse-all-btn")?.addEventListener("click", () => {
      this.events.onCollapseAll();
    });

    this.root.querySelector<HTMLButtonElement>("#export-btn")?.addEventListener("click", () => {
      this.events.onExport();
    });

    this.root.querySelector<HTMLInputElement>("#capture-toggle")?.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      this.state.captureEnabled = Boolean(target.checked);
      setStoredCaptureEnabled(this.state.captureEnabled);
      this.renderCaptureState();
      this.events.onCaptureToggled(this.state.captureEnabled);
    });

    this.events.onFiltersChanged(this.getState());
    this.events.onCaptureToggled(this.state.captureEnabled);
  }

  private renderCaptureState(): void {
    const stateLabel = this.root.querySelector<HTMLElement>("#capture-toggle-label");
    const stateText = this.root.querySelector<HTMLElement>("#capture-state-text");
    const captureToggle = this.root.querySelector<HTMLInputElement>("#capture-toggle");
    if (!stateLabel || !stateText || !captureToggle) {
      return;
    }

    stateText.textContent = this.state.captureEnabled ? "Capturing" : "Paused";
    stateLabel.classList.toggle("active", this.state.captureEnabled);
    stateLabel.classList.toggle("paused", !this.state.captureEnabled);
    captureToggle.checked = this.state.captureEnabled;
  }

  updateSearchMatches(current: number, total: number): void {
    const nav = this.root.querySelector<HTMLElement>("#search-nav");
    const count = this.root.querySelector<HTMLElement>("#search-match-count");
    const prev = this.root.querySelector<HTMLButtonElement>("#search-prev-btn");
    const next = this.root.querySelector<HTMLButtonElement>("#search-next-btn");
    if (!nav || !count || !prev || !next) {
      return;
    }

    const hasQuery = Boolean(this.state.searchText);
    nav.classList.toggle("active", hasQuery);

    if (!hasQuery) {
      count.textContent = "";
      prev.disabled = true;
      next.disabled = true;
      return;
    }

    if (total <= 0) {
      count.textContent = "0 matches";
      prev.disabled = true;
      next.disabled = true;
      return;
    }

    count.textContent = `${current} / ${total}`;
    const disableArrows = total <= 1;
    prev.disabled = disableArrows;
    next.disabled = disableArrows;
  }

  getState(): FilterState {
    return {
      selectedMethod: this.state.selectedMethod,
      searchText: this.state.searchText,
      includeInternal: this.state.includeInternal,
      captureEnabled: this.state.captureEnabled
    };
  }
}
