export class Match {
    regex: string;
    template: string;
}

export class AggregatorArgs {
    scope: string[];
    matches: Match[];
}
