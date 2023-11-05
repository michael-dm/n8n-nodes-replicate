export type ReplicateProperty = {
	title: string;
	description: string;
	type: string;
};

export type ReplicateProperties = {
	[key: string]: ReplicateProperty;
};
