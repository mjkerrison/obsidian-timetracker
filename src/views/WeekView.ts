import { ItemView, WorkspaceLeaf } from "obsidian";
import type TimeTrackerPlugin from "../main";
import { VIEW_TYPE_WEEK } from "../types";
import { WeekGrid } from "../components/WeekGrid";
import { formatDate, getMonthName } from "../utils/time";

export class WeekView extends ItemView {
	plugin: TimeTrackerPlugin;
	private weekGrid: WeekGrid | null = null;
	private currentDate: Date = new Date();
	private headerEl: HTMLElement | null = null;
	private storageListener: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TimeTrackerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_WEEK;
	}

	getDisplayText(): string {
		return "Time Tracker - Week View";
	}

	getIcon(): string {
		return "calendar-clock";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("tt-week-view");

		// Header with navigation
		this.renderHeader(container as HTMLElement);

		// Grid container
		const gridContainer = container.createDiv({ cls: "tt-grid-container" });

		// Initialize grid
		this.weekGrid = new WeekGrid(gridContainer, {
			weekStartDay: this.plugin.settings.weekStartDay,
			currentDate: this.currentDate,
			storage: this.plugin.storage,
		});

		// Listen for storage changes
		this.storageListener = () => this.weekGrid?.render();
		this.plugin.storage.addListener(this.storageListener);
	}

	private renderHeader(container: HTMLElement) {
		this.headerEl = container.createDiv({ cls: "tt-week-header" });

		const nav = this.headerEl.createDiv({ cls: "tt-week-nav" });

		// Previous week
		const prevWeekBtn = nav.createEl("button", { cls: "tt-nav-btn", text: "‹‹" });
		prevWeekBtn.setAttribute("aria-label", "Previous week");
		prevWeekBtn.addEventListener("click", () => this.navigateWeek(-1));

		// Previous day
		const prevDayBtn = nav.createEl("button", { cls: "tt-nav-btn", text: "‹" });
		prevDayBtn.setAttribute("aria-label", "Previous day");
		prevDayBtn.addEventListener("click", () => this.navigateDay(-1));

		// Current period display
		const periodDisplay = nav.createDiv({ cls: "tt-period-display" });
		this.updatePeriodDisplay(periodDisplay);

		// Today button
		const todayBtn = nav.createEl("button", { cls: "tt-nav-btn tt-today-btn", text: "Today" });
		todayBtn.addEventListener("click", () => this.goToToday());

		// Next day
		const nextDayBtn = nav.createEl("button", { cls: "tt-nav-btn", text: "›" });
		nextDayBtn.setAttribute("aria-label", "Next day");
		nextDayBtn.addEventListener("click", () => this.navigateDay(1));

		// Next week
		const nextWeekBtn = nav.createEl("button", { cls: "tt-nav-btn", text: "››" });
		nextWeekBtn.setAttribute("aria-label", "Next week");
		nextWeekBtn.addEventListener("click", () => this.navigateWeek(1));
	}

	private updatePeriodDisplay(el?: HTMLElement) {
		const display = el || this.headerEl?.querySelector(".tt-period-display");
		if (!display) return;

		display.empty();

		// Show the date range being displayed
		if (this.weekGrid) {
			const currentDate = this.weekGrid.getCurrentDate();
			const month = getMonthName(currentDate, false);
			const year = currentDate.getFullYear();
			display.textContent = `${month} ${year}`;
		} else {
			const month = getMonthName(this.currentDate, false);
			const year = this.currentDate.getFullYear();
			display.textContent = `${month} ${year}`;
		}
	}

	private navigateDay(delta: number) {
		this.weekGrid?.navigateDay(delta);
		if (this.weekGrid) {
			this.currentDate = this.weekGrid.getCurrentDate();
		}
		this.updatePeriodDisplay();
	}

	private navigateWeek(delta: number) {
		this.weekGrid?.navigateWeek(delta);
		if (this.weekGrid) {
			this.currentDate = this.weekGrid.getCurrentDate();
		}
		this.updatePeriodDisplay();
	}

	private goToToday() {
		this.weekGrid?.goToToday();
		if (this.weekGrid) {
			this.currentDate = this.weekGrid.getCurrentDate();
		}
		this.updatePeriodDisplay();
	}

	refresh() {
		this.weekGrid?.render();
	}

	async onClose() {
		this.weekGrid?.destroy();
		if (this.storageListener) {
			this.plugin.storage.removeListener(this.storageListener);
			this.storageListener = null;
		}
	}
}
