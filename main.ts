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
import moment from "moment";

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
	// Maximum time allowed for regex execution in ms
	private readonly REGEX_TIMEOUT = 10000; // 10 seconds

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor(
			"aggregator",
			async (source, el, ctx) => {
				// Generate a unique ID for this execution instance
				const execId = Math.random().toString(36).substring(2, 8); // Short hash
				if (this.settings.debug) {
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: Starting execution`
					);
				}
				const startTime = performance.now();

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
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]:`,
						error
					);
					return;
				}
				if (this.settings.debug) {
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: args\n`,
						args
					);
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
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]:`,
						error
					);
					return;
				}
				if (argsMatches.length == 0) return;
				if (this.settings.debug) {
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: argsMatches\n`,
						argsMatches
					);
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
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: files\n`,
						files.join("\n")
					);
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: Processing ${
							allMDFile.length
						} files`
					);
				}

				// Collect results
				const limitSearch = !isNaN(Number(args.limitSearch))
					? Number(args.limitSearch)
					: this.settings.limitSearch;
				let results: Result[] = [];
				if (this.settings.debug) {
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: Starting match collection with limitSearch=${limitSearch}`
					);
				}
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
						if (this.settings.debug) {
							console.log(
								`[${moment().format(
									"YYYY-MM-DD HH:mm:ss"
								)}] Aggregator[${execId}]: Applying regex on file ${
									file.path
								}`
							);

							// Log file size and regex pattern
							console.log(
								`[${moment().format(
									"YYYY-MM-DD HH:mm:ss"
								)}] Aggregator[${execId}]: File size: ${
									content.length
								} chars, Regex pattern: ${m.regex.toString()}`
							);

							// Check for problematic regex patterns
							const regexStr = m.regex.toString();
							if (this.isLikelyProblematicRegex(regexStr)) {
								console.log(
									`[${moment().format(
										"YYYY-MM-DD HH:mm:ss"
									)}] Aggregator[${execId}]: ⚠️WARNING: Potentially inefficient regex pattern detected: ${regexStr}`
								);
							}
						}

						const regexStartTime = performance.now();
						// Use a timeout to detect potentially problematic regex operations
						const MAX_REGEX_TIME = 5000; // 5 seconds
						let timeoutId: NodeJS.Timeout | null = null;
						let timeoutWarningDisplayed = false;

						if (this.settings.debug) {
							timeoutId = setTimeout(() => {
								console.log(
									`[${moment().format(
										"YYYY-MM-DD HH:mm:ss"
									)}] Aggregator[${execId}]: ⚠️WARNING: Regex operation taking too long (>5s) on ${
										file.path
									}. This may be due to an inefficient regex pattern or a large file.`
								);
								timeoutWarningDisplayed = true;
							}, MAX_REGEX_TIME);
						}

						let matchesArray: RegExpMatchArray[] = [];
						try {
							// For large files, process in chunks to avoid excessive runtime
							if (content.length > 100000) {
								// 100KB threshold
								if (this.settings.debug) {
									console.log(
										`[${moment().format(
											"YYYY-MM-DD HH:mm:ss"
										)}] Aggregator[${execId}]: Large file detected (${
											content.length
										} chars), using chunked processing`
									);
								}

								// Process in 50KB chunks with slight overlap to avoid missing matches at chunk boundaries
								const chunkSize = 50000;
								const overlap = 1000;
								let processedChunks = 0;

								for (
									let i = 0;
									i < content.length;
									i += chunkSize - overlap
								) {
									processedChunks++;
									if (
										this.REGEX_TIMEOUT > 0 &&
										performance.now() - regexStartTime >
											this.REGEX_TIMEOUT
									) {
										if (this.settings.debug) {
											console.log(
												`[${moment().format(
													"YYYY-MM-DD HH:mm:ss"
												)}] Aggregator[${execId}]: ⚠️Regex timeout reached after processing ${processedChunks} chunks. Stopping further processing.`
											);
										}
										break;
									}

									const chunk = content.substring(
										i,
										Math.min(i + chunkSize, content.length)
									);
									const chunkMatches = Array.from(
										chunk.matchAll(m.regex)
									);

									// Add matches, adjusting indices for chunk position
									for (const match of chunkMatches) {
										// Only add if it's not a duplicate from the overlap
										if (
											match.index !== undefined &&
											(i === 0 || match.index >= overlap)
										) {
											// Clone the match and adjust the index
											const adjustedMatch = [
												...match,
											] as RegExpMatchArray;
											if (match.index !== undefined) {
												adjustedMatch.index =
													i +
													match.index -
													(i > 0 ? overlap : 0);
											}
											matchesArray.push(adjustedMatch);
										}
									}
								}
							} else {
								// For smaller files, process normally
								let matches = content.matchAll(m.regex);
								matchesArray = Array.from(matches);
							}
						} catch (error) {
							if (this.settings.debug) {
								console.log(
									`[${moment().format(
										"YYYY-MM-DD HH:mm:ss"
									)}] Aggregator[${execId}]: ⚠️ERROR: Regex execution failed: ${error}`
								);
							}
						}

						const regexEndTime = performance.now();
						if (timeoutId) clearTimeout(timeoutId);

						if (this.settings.debug) {
							const executionTime = regexEndTime - regexStartTime;
							console.log(
								`[${moment().format(
									"YYYY-MM-DD HH:mm:ss"
								)}] Aggregator[${execId}]: Regex execution took ${executionTime}ms, found ${
									matchesArray.length
								} matches in ${file.path}`
							);

							// Provide specific advice if the regex is slow
							if (executionTime > 1000) {
								console.log(
									`[${moment().format(
										"YYYY-MM-DD HH:mm:ss"
									)}] Aggregator[${execId}]: ⚠️ Consider optimizing your regex pattern or using a more specific scope for this file.`
								);
							}
						}

						for (let match of matchesArray) {
							if (limitSearch > 0 && results.length > limitSearch)
								break;
							if (this.settings.debug) {
								console.log(
									`[${moment().format(
										"YYYY-MM-DD HH:mm:ss"
									)}] Aggregator[${execId}]: Find match in\n${
										file.path
									} -> ${match[0]}`
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
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: results\n`,
						results
					);
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
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: summaries\n`,
						summaries
					);
				}

				const jstr =
					args.joinString == null || args.joinString == undefined
						? this.settings.joinString
						: args.joinString;
				let summary = summaries.join(jstr);
				if (this.settings.debug) {
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: summary\n${summary}`
					);
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
							`[${moment().format(
								"YYYY-MM-DD HH:mm:ss"
							)}] Aggregator[${execId}]: decorated summary\n${summary}`
						);
					}
				}
				await this.renderMarkdown(summary, el, ctx);

				// Log overall execution time
				const endTime = performance.now();
				const executionTime = endTime - startTime;
				if (this.settings.debug) {
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] Aggregator[${execId}]: Execution completed in ${executionTime}ms`
					);

					// Performance advice if execution was slow
					if (executionTime > 10000) {
						// Over 10 seconds is quite slow
						console.log(
							`[${moment().format(
								"YYYY-MM-DD HH:mm:ss"
							)}] Aggregator[${execId}]: ⚠️ Performance recommendations:`
						);
						console.log(
							`[${moment().format(
								"YYYY-MM-DD HH:mm:ss"
							)}] Aggregator[${execId}]: 1. Limit the scope to fewer files`
						);
						console.log(
							`[${moment().format(
								"YYYY-MM-DD HH:mm:ss"
							)}] Aggregator[${execId}]: 2. Simplify regex patterns to avoid backtracking`
						);
						console.log(
							`[${moment().format(
								"YYYY-MM-DD HH:mm:ss"
							)}] Aggregator[${execId}]: 3. Add more specific anchors to your patterns`
						);
						console.log(
							`[${moment().format(
								"YYYY-MM-DD HH:mm:ss"
							)}] Aggregator[${execId}]: 4. Consider increasing limitSearch to stop processing earlier`
						);
					}
				}
			}
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AggregatorSettingTab(this.app, this));
		console.log(
			`[${moment().format(
				"YYYY-MM-DD HH:mm:ss"
			)}] Aggregator: Plugin loaded`
		);
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

	/**
	 * Checks if a regex pattern might be problematic for performance
	 * @param regexStr The regex pattern as a string
	 * @returns True if the pattern might cause performance issues
	 */
	private isLikelyProblematicRegex(regexStr: string): boolean {
		// Remove regex delimiters and flags
		regexStr = regexStr.replace(/^\/|\/[gimuy]*$/g, "");

		// Check for patterns that might cause catastrophic backtracking
		const problematicPatterns = [
			// Nested repetition without proper anchoring
			/\([^()]*\+[^()]*\)\+/,
			/\([^()]*\*[^()]*\)\+/,
			/\([^()]*\+[^()]*\)\*/,
			/\([^()]*\*[^()]*\)\*/,

			// Multiple adjacent optional patterns
			/\.\*\.\*/,
			/\.\+\.\+/,

			// Greedy quantifiers followed by similar content
			/\w+\s+\w+/,

			// Complex lookaheads/lookbehinds with repetition
			/\(\?=[^)]*\*[^)]*\)/,
			/\(\?<=[^)]*\*[^)]*\)/,

			// Extremely long alternatives
			/(?:[^|]*\|){10,}/,
		];

		return problematicPatterns.some((pattern) => pattern.test(regexStr));
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
				`[${moment().format(
					"YYYY-MM-DD HH:mm:ss"
				)}] Aggregator: html element\n${summaryContainer.innerHTML}`
			);
		}
		el.replaceWith(summaryContainer);
	}
}
