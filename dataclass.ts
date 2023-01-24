export class Match {
	regex: string;
	template: string;
}

export class Order {
	fields: string;
	orders: string;
}

export class AggregatorArgs {
	scope: string[];
	matches: Match[];
	order: Order;
}

export class Result {
	path: string;
    filename: string;
	basename: string;
	extension: string;
	ctime: number;
	mtime: number;
	match: string;
	index: number;
	line: number;
	ch: number;
	template: string;
}
