import { App, PluginSettingTab, Setting } from "obsidian";
import Aggregator from "main";

export interface AggregatorSettings {
	fileLink: boolean;
	noCurFile: boolean;
	defaultFields: string;
	defaultOrders: string;
	fileIndecator: string;
	joinString: string;
	limitSearch: number;
	limitDisplay: number;
	excludedRegex: string;
	debug: boolean;
}

export const DEFAULT_SETTINGS: AggregatorSettings = {
	fileLink: true,
	noCurFile: true,
	defaultFields: "ctime, index",
	defaultOrders: "asc, asc",
	fileIndecator: "ID {{result.index}}, From [[{{result.path}}]]\n{{template}}",
	joinString: "\n",
	limitSearch: 100,
	limitDisplay: -1,
	excludedRegex: "",
	debug: false,
};

export class AggregatorSettingTab extends PluginSettingTab {
	plugin: Aggregator;

	constructor(app: App, plugin: Aggregator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Aggregator" });

		containerEl.createEl("h3", { text: "User Option" });

		new Setting(containerEl)
			.setName("Append File Link")
			.setDesc("Append file link at the end of blocks.")
			.addToggle((value) => {
				value
					.setValue(this.plugin.settings.fileLink)
					.onChange((value) => {
						this.plugin.settings.fileLink = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("No Current File")
			.setDesc("Don't Append file link when aggregating in current file.")
			.addToggle((value) => {
				value
					.setValue(this.plugin.settings.noCurFile)
					.onChange((value) => {
						this.plugin.settings.noCurFile = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("Default Fields")
			.setDesc("Default fields for sorting.")
			.addText((value) => {
				value
					.setValue(this.plugin.settings.defaultFields)
					.onChange((value) => {
						this.plugin.settings.defaultFields = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("Default Orders")
			.setDesc("Default orders for sorting.")
			.addText((value) => {
				value
					.setValue(this.plugin.settings.defaultOrders)
					.onChange((value) => {
						this.plugin.settings.defaultOrders = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("File Indicator")
			.setDesc(
				"Indicate which file the result is from. It will be add at the beginning of the result."
			)
			.addTextArea((value) => {
				value
					.setValue(this.plugin.settings.fileIndecator)
					.onChange((value) => {
						this.plugin.settings.fileIndecator = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("Join String")
			.setDesc("String for joining all results in the summary.")
			.addTextArea((value) => {
				value
					.setValue(this.plugin.settings.joinString)
					.onChange((value) => {
						this.plugin.settings.joinString = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("Found Result Limitation")
			.setDesc(
				"Limit the number of found results when searching in the summary. Set the number larger than 0 to enable."
			)
			.addText((value) => {
				value
					.setValue(String(this.plugin.settings.limitSearch))
					.onChange((value) => {
						if (!isNaN(Number(value))) {
							this.plugin.settings.limitSearch = Number(value);
							this.plugin.saveSettings();
						}
					});
			});
		new Setting(containerEl)
			.setName("Display Result Limitation")
			.setDesc(
				"Limit the number of results when displaying in the summary. Set the number larger than 0 to enable."
			)
			.addText((value) => {
				value
					.setValue(String(this.plugin.settings.limitDisplay))
					.onChange((value) => {
						if (!isNaN(Number(value))) {
							this.plugin.settings.limitDisplay = Number(value);
							this.plugin.saveSettings();
						}
					});
			});
		new Setting(containerEl)
			.setName("Excluded regex")
			.setDesc(
				"The matched result of this regex will be excluded from searching content."
			)
			.addText((value) => {
				value
					.setValue(this.plugin.settings.excludedRegex)
					.onChange((value) => {
						this.plugin.settings.excludedRegex = value;
						this.plugin.saveSettings();
					});
			});

		containerEl.createEl("h3", { text: "Dev Option" });

		new Setting(containerEl)
			.setName("Debug")
			.setDesc("Enable debug mode.")
			.addToggle((value) => {
				value.setValue(this.plugin.settings.debug).onChange((value) => {
					this.plugin.settings.debug = value;
					this.plugin.saveSettings();
				});
			});
	}
}
