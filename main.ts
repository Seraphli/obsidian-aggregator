/* eslint no-eval: 0 */
import {
	Plugin,
	parseYaml,
	stringifyYaml,
	TFile,
	MarkdownRenderer,
	MarkdownPostProcessorContext,
} from "obsidian";
import {
	AggregatorSettings,
	DEFAULT_SETTINGS,
	AggregatorSettingTab,
} from "settings";
import { AggregatorArgs, Register, Result } from "dataclass";
import { CURFILE, SELFBLOCK, FIELDS, ORDERS } from "./constants";
import * as Handlebars from "handlebars";
import * as _ from "lodash";
import * as moment from "moment";

function checkOrder(fields: string[], orders: string[]) {
	if (fields.length != orders.length)
		return { flag: false, msg: "length of fields and orders must match" };
	if (!fields.every((val) => FIELDS.includes(val)))
		return { flag: false, msg: `fields must in ${FIELDS}` };
	if (!orders.every((val) => ORDERS.includes(val)))
		return { flag: false, msg: `orders must in ${ORDERS}` };
	return { flag: true, msg: "" };
}

export default class Aggregator extends Plugin {
	settings: AggregatorSettings;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor(
			"aggregator",
			async (source, el, ctx) => {
				// Check tab
				source = source.trim();
				const tabMatch = source.match(/\t/gm);
				if (tabMatch != null && tabMatch.length > 0) {
					await this.renderMarkdown(
						"**Error**: Don't use tab to indent. Replace tab with spaces.",
						el,
						ctx
					);
					return;
				}

				// Parse yaml
				let args: AggregatorArgs;
				try {
					args = parseYaml(source) as AggregatorArgs;
				} catch (error) {
					await this.renderMarkdown(
						`**Error**: Yaml parse error.\n${error}`,
						el,
						ctx
					);
					console.log("Aggregator", error);
					return;
				}
				if (this.settings.debug) {
					console.log("Aggregator: args\n", args);
				}

				// Handle arguments
				let argsMatches: {
					regex: RegExp;
					template: HandlebarsTemplateDelegate;
				}[] = [];
				let argsOrders: {
					fields: string[];
					orders: string[];
				} = { fields: [], orders: [] };
				try {
					for (const m of args.matches) {
						const regex = new RegExp(m.regex, "gm");
						const template = Handlebars.compile(m.template, {
							noEscape: true,
						});
						argsMatches.push({ regex, template });
					}
					if (args.order) {
						argsOrders.fields = args.order.fields
							.split(",")
							.map((val) => val.trim());
						argsOrders.orders = args.order.orders
							.split(",")
							.map((val) => val.trim());
						const res = checkOrder(
							argsOrders.fields,
							argsOrders.orders
						);
						if (!res.flag) throw Error(res.msg);
					}
				} catch (error) {
					await this.renderMarkdown(
						`**Error**: Arguments parse error.\n${error}`,
						el,
						ctx
					);
					console.log("Aggregator", error);
					return;
				}
				if (argsMatches.length == 0) return;
				if (this.settings.debug) {
					console.log("Aggregator: argsMatches\n", argsMatches);
				}

				// Filter files
				const allMDFile: TFile[] = [];
				const partRegexFile: string[] = [];
				args.scope.forEach((val) => {
					if (val == CURFILE) {
						const file = this.app.vault.getAbstractFileByPath(
							ctx.sourcePath
						);
						if (file instanceof TFile) {
							allMDFile.push(file);
						}
					} else {
						const file = this.app.vault.getAbstractFileByPath(val);
						if (file instanceof TFile) {
							allMDFile.push(file);
						} else {
							partRegexFile.push(val);
						}
					}
				});
				if (partRegexFile.length > 0) {
					const partRegex: RegExp[] = [];
					partRegexFile.forEach((val) => {
						partRegex.push(new RegExp(val, "g"));
					});
					let mdFiles = this.app.vault.getMarkdownFiles();
					mdFiles.forEach((val) => {
						const scopeMatches = partRegex.filter((regex) => {
							const m = val.path.match(regex);
							if (m == null || m.length == 0) {
								return false;
							}
							return true;
						});
						if (scopeMatches.length > 0) {
							allMDFile.push(val);
						}
					});
				}
				if (allMDFile.length == 0) return;
				if (this.settings.debug) {
					const files: string[] = [];
					for (const file of allMDFile) {
						files.push(file.path);
					}
					console.log("Aggregator: files\n", files.join("\n"));
				}

				// Collect results
				const limitSearch = !isNaN(Number(args.limitSearch))
					? Number(args.limitSearch)
					: this.settings.limitSearch;
				let results: Result[] = [];
				for (const file of allMDFile) {
					if (limitSearch > 0 && results.length > limitSearch) break;
					// Read file content
					const fileContent = await this.app.vault.cachedRead(file);
					let content = fileContent;
					content = content.replace(SELFBLOCK, "");
					if (this.settings.excludedRegex != "") {
						content = content.replace(
							new RegExp(this.settings.excludedRegex),
							""
						);
					}
					for (const m of argsMatches) {
						if (limitSearch > 0 && results.length > limitSearch)
							break;
						let matches = content.matchAll(m.regex);
						for (let match of matches) {
							if (limitSearch > 0 && results.length > limitSearch)
								break;
							if (this.settings.debug) {
								console.log(
									`Aggregator: Find match in\n${file.path} -> ${match[0]}`
								);
							}

							let substringStartToMatch = content.substring(
								0,
								match.index
							);
							let lines = substringStartToMatch.split("\n");
							let numberOfLines = lines.length;
							let numberOfChars = lines[lines.length - 1].length;

							let result: Result = {
								index: 0,
								path: file.path,
								filename: file.basename + file.extension,
								basename: file.basename,
								extension: file.extension,
								ctime: file.stat.ctime,
								mtime: file.stat.mtime,
								match: match,
								matchIndex: match.index ? match.index : -1,
								line: numberOfLines,
								ch: numberOfChars,
								content: content,
								template: m.template,
								register: {
									s: "",
									n: 0,
									b: false,
								},
							};
							results.push(result);
						}
					}
				}

				// Sort
				if (argsOrders.fields.length > 0) {
					results = _.orderBy(
						results,
						argsOrders.fields,
						// @ts-ignore
						argsOrders.orders
					);
				} else {
					if (this.settings.defaultFields.length > 0) {
						const fields = this.settings.defaultFields
							.split(",")
							.map((val) => val.trim());
						const orders = this.settings.defaultOrders
							.split(",")
							.map((val) => val.trim());
						const res = checkOrder(fields, orders);
						if (res.flag) {
							results = _.orderBy(
								results,
								fields,
								// @ts-ignore
								orders
							);
						} else {
							results = _.orderBy(
								results,
								["ctime", "line"],
								["asc", "asc"]
							);
						}
					} else {
						results = _.orderBy(
							results,
							["ctime", "line"],
							["asc", "asc"]
						);
					}
				}
				if (this.settings.debug) {
					console.log("Aggregator: results\n", results);
				}

				// Create summary
				let summaries: string[] = [];
				const limitDisplay = !isNaN(Number(args.limitDisplay))
					? Number(args.limitDisplay)
					: this.settings.limitDisplay;
				const fileLink =
					args.fileLink == null || args.fileLink == undefined
						? this.settings.fileLink
						: args.fileLink;
				const noCurFile =
					args.noCurFile == null || args.noCurFile == undefined
						? this.settings.noCurFile
						: args.noCurFile;
				const fileIndecator =
					args.fileIndecator == null ||
					args.fileIndecator == undefined
						? this.settings.fileIndecator
						: args.fileIndecator;
				const register: Register = { s: "", n: 0, b: false };
				for (const result of results) {
					if (limitDisplay > 0 && summaries.length > limitDisplay)
						break;
					let template = result.template;
					result.index = summaries.length + 1;
					let data: {
						result: Result;
						summaries: string[];
						register: Register;
					} = { result, summaries, register };
					Handlebars.registerHelper("eval", (aString: string) => {
						const ret = new Function("data", aString)(data);
						return ret == null || ret == undefined ? "" : ret;
					});
					let summary = template(data);
					if (fileLink) {
						if (!(result.path == ctx.sourcePath && noCurFile)) {
							let data: {
								result: Result;
								summaries: string[];
								register: Register;
								template: string;
							} = {
								result,
								summaries,
								register,
								template: summary,
							};
							Handlebars.registerHelper(
								"eval",
								(aString: string) => {
									const ret = new Function("data", aString)(
										data
									);
									return ret == null || ret == undefined
										? ""
										: ret;
								}
							);
							summary = Handlebars.compile(fileIndecator)(data);
						}
					}
					summaries.push(summary);
				}
				if (this.settings.debug) {
					console.log("Aggregator: summaries\n", summaries);
				}

				const jstr =
					args.joinString == null || args.joinString == undefined
						? this.settings.joinString
						: args.joinString;
				let summary = summaries.join(jstr);
				if (this.settings.debug) {
					console.log(`Aggregator: summary\n${summary}`);
				}
				if (!(args.decorator == null || args.decorator == undefined)) {
					let data: {
						templates: string;
						summaries: string[];
						register: Register;
					} = {
						templates: summary,
						summaries,
						register,
					};
					Handlebars.registerHelper("eval", (aString: string) => {
						const ret = new Function("data", aString)(data);
						return ret == null || ret == undefined ? "" : ret;
					});
					summary = Handlebars.compile(args.decorator)(data);
					if (this.settings.debug) {
						console.log(
							`Aggregator: decorated summary\n${summary}`
						);
					}
				}
				await this.renderMarkdown(summary, el, ctx);
			}
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AggregatorSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async renderMarkdown(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		let summaryContainer = createEl("div");
		await MarkdownRenderer.render(
			this.app,
			source,
			summaryContainer,
			ctx.sourcePath,
			this
		);
		if (this.settings.debug) {
			console.log(
				`Aggregator: html element\n${summaryContainer.innerHTML}`
			);
		}
		el.replaceWith(summaryContainer);
	}
}
