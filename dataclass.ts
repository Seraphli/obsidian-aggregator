export class Match {
	regex: string;
	template: string;
}

export class Order {
	fields: string;
	orders: string;
}

export class Register {
	s: string;
	n: number;
	b: boolean;
}

export class AggregatorArgs {
	scope: string[];
	matches: Match[];
	order: Order;
	fileIndecator: string;
	joinString: string;
	decorator: string;
	limitSearch: number;
	limitDisplay: number;
	fileLink: boolean;
	noCurFile: boolean;
}

export class Result {
	index: number;
	path: string;
	filename: string;
	basename: string;
	extension: string;
	ctime: number;
	mtime: number;
	match: RegExpMatchArray;
	matchIndex: number;
	line: number;
	ch: number;
	content: string;
	template: HandlebarsTemplateDelegate;
	register: Register;
}
