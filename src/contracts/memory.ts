export interface MemoryPage {pageId:string;revision:number;content:string}
export interface MemorySnapshot {releaseId:string;pages:readonly MemoryPage[]}
export interface MemoryProvider {read(input:unknown,budget:number):Promise<MemorySnapshot>|MemorySnapshot;record?(entry:{agentId:string;executionId:string;input:unknown;output:unknown;status:string}):Promise<void>|void}
