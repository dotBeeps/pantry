export interface StoneMessage {
	id: string;
	from: string;         // ID/defstring (e.g. "wise-griffin-researcher" or "primary-agent")
	displayName?: string; // friendly name (e.g. "Kestrel" or "Ember 🐉")
	addressing: string;   // "primary-agent" | "user" | "guild-master" | "session-room" | ally defName
	type: "result" | "progress" | "question" | "status";
	content: string;
	color?: string;       // deprecated — use displayName for color derivation
	metadata?: unknown;
	timestamp: number;
}

export interface StoneAPI {
	send(msg: Partial<StoneMessage> & { content: string; from: string }): Promise<void>;
	onMessage(handler: (msg: StoneMessage) => void): () => void;
	port(): number | null;
}

export const STONE_KEY = Symbol.for("hoard.stone");
