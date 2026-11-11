export declare const SUPPLY:bigint, SELL:bigint, GRADUATION_QUOTE:bigint, MIGRATE_FEE:bigint, FEE_RATE:bigint, FEE_DENOMINATOR:bigint, MAX_FIRST_BUY:bigint, MIN_FIRST_BUY:bigint;
export declare const FEES:{protocol:bigint;platform:bigint;creator:bigint};
export interface CurveState{supply:bigint;totalSell:bigint;target:bigint;locked:bigint;virtualBase:bigint;virtualQuote:bigint;realBase:bigint;realQuote:bigint}
export declare function standardCurve(o?:{locked?:bigint;supply?:bigint;totalSell?:bigint;target?:bigint;migrateFee?:bigint}):CurveState;
export declare function buyExactIn(c:CurveState,amountIn:bigint,feeRate?:bigint):{spent:bigint;tokens:bigint;fee:bigint;net:bigint;completes:boolean};
export declare function curveCapacity(o?:{locked?:bigint;target?:bigint}):bigint;
export declare function splitFirstBuy(budget:bigint,creatorBuy:bigint,spent:bigint,tokens:bigint):{creatorSpent:bigint;creatorTokens:bigint};
export interface FirstBuyQuote{budget:bigint;spent:bigint;fee:bigint;tokens:bigint;completes:boolean;unspent:bigint;creatorSpent:bigint;creatorTokens:bigint;windowTokens:bigint;pledgeSpent:bigint;pctOfSupply:number;pctOfCurve:number;avgPrice:number;startPrice:number;spotAfter:number;impliedMcapSol:number;mcapAfterSol:number;curveSolAfter:number;remainingToMigrateSol:number;remainingToMigrateGrossSol:number;graduationSol:number;capacitySol:number;target:bigint;decimals:number}
export declare function firstBuyQuote(o?:{raise?:bigint;creatorBuy?:bigint;locked?:bigint;target?:bigint;decimals?:number}):FirstBuyQuote;
export declare function maxFirstBuyFor(target:bigint|number|string):bigint;
export declare function migrationTarget(o:{solUsd:number|string;quoteUsd:number|string;decimals:number}):bigint;
export declare const MIN_WINDOW_SECS:number, MAX_WINDOW_SECS:number, DEFAULT_WINDOW_SECS:number, MAX_LOCK_DAYS:number;
export interface QuotePair{symbol:string;name:string;mint:string;live:boolean;graduation:string;note?:string}
export declare const QUOTES:QuotePair[];
