import { App, PluginSettingTab, Setting } from "obsidian";
import Aggregator from "main";

export interface AggregatorSettings {
	fileLink: boolean;
	noCurFile: boolean;
	fileIndecator: string;
	joinString: string;
	limitResult: number;
	excludedRegex: string;
	debug: boolean;
}

export const DEFAULT_SETTINGS: AggregatorSettings = {
	fileLink: true,
	noCurFile: true,
	fileIndecator: "ID {{index}}, From [[{{file.path}}]]\n",
	joinString: "\n\n",
	limitResult: 100,
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
			.setName("Limit Result")
			.setDesc("Limit the number of results in the summary.")
			.addText((value) => {
				value
					.setValue(String(this.plugin.settings.limitResult))
					.onChange((value) => {
						if (!isNaN(Number(value))) {
							this.plugin.settings.limitResult = Number(value);
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
