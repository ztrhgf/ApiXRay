import type { FilterState, HttpMethod, MethodFilter } from "../../shared/types";

type ToolbarEvents = {
  onFiltersChanged: (state: FilterState) => void;
  onClear: () => void;
  onExport: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
};

const METHOD_ORDER: MethodFilter[] = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE", "OTHER"];

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
      includeInternal: false
    };
  }

  async render(): Promise<void> {
    this.state.includeInternal = await getStoredIncludeInternal();

    const methodOptions = METHOD_ORDER.map(
      (method) => `<option value="${method}" ${this.state.selectedMethod === method ? "selected" : ""}>${method}</option>`
    ).join("");

    this.root.innerHTML = `
      <div class="toolbar-row">
        <label for="method-filter">Method</label>
        <select class="select-input" id="method-filter">${methodOptions}</select>
        <input class="text-input" id="search-input" type="text" placeholder="Filter by URL..." />
      </div>
      <div class="toolbar-row">
        <label>
          <input id="internal-toggle" type="checkbox" ${this.state.includeInternal ? "checked" : ""} />
          Show Internal Endpoints
        </label>
        <button id="expand-all-btn" class="action-btn">Expand All</button>
        <button id="collapse-all-btn" class="action-btn">Collapse All</button>
        <button id="clear-btn" class="action-btn">Clear</button>
        <button id="export-btn" class="action-btn">Export JSON</button>
      </div>
    `;

    const methodFilter = this.root.querySelector<HTMLSelectElement>("#method-filter");
    methodFilter?.addEventListener("change", () => {
      this.state.selectedMethod = (methodFilter.value as MethodFilter) || "ALL";
      this.events.onFiltersChanged(this.getState());
    });

    const searchInput = this.root.querySelector<HTMLInputElement>("#search-input");
    searchInput?.addEventListener("input", () => {
      this.state.searchText = searchInput.value.trim().toLowerCase();
      this.events.onFiltersChanged(this.getState());
    });

    const internalToggle = this.root.querySelector<HTMLInputElement>("#internal-toggle");
    internalToggle?.addEventListener("change", () => {
      const checked = Boolean(internalToggle.checked);
      this.state.includeInternal = checked;
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

    this.events.onFiltersChanged(this.getState());
  }

  getState(): FilterState {
    return {
      selectedMethod: this.state.selectedMethod,
      searchText: this.state.searchText,
      includeInternal: this.state.includeInternal
    };
  }
}
